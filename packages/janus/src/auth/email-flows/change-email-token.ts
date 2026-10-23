/**
 * The token a change of e-mail sends and redeems: issued for the NEW
 * address, bound to the address it replaces, and refused when the user's
 * e-mail is no longer that one.
 *
 * `address` holds the new address; `codeHash` holds the former one, keyed by
 * the token's secret (`TokenRecord.codeHash`), so the port needs no field and
 * a dump of the store reveals neither.
 */

import { TokenError, UserInvalidError } from '../../errors/janus-error';
import { normalizeEmail, type ResolvedType } from '../config';
import { type Context, emailOf, validateFields } from '../context';
import { issueOneTime, spendOneTime, unknownOneTime } from '../one-time';
import type { TokenRecord, UserRecord } from '../port/types';
import { hashSecret, mintSecret } from '../secrets';
import type { IssuedToken } from '../types';
import { ownerOf } from './owner-of';

/** What binds a token to the address it replaces. */
export const formerHash = (secret: string, former: string | null): string =>
	hashSecret(
		`janus/changeEmail/former\0${secret}\0${normalizeEmail(former ?? '')}`,
	);

/**
 * Validates `email` as the user's new address — by the type's own schema, the
 * other fields as they are — and gives it back as the schema left it. An
 * address equal to the current one once normalised is `USER_INVALID`: moving
 * to where the user already is means nothing (`verifyEmail` proves it).
 */
export async function newAddressOf(
	type: ResolvedType,
	user: UserRecord,
	email: string,
	where: string,
): Promise<string> {
	const fields = await validateFields(
		type,
		{ ...user.fields, [type.email]: email },
		where,
	);
	const address = emailOf(type, fields);
	if (address === null) {
		throw new TypeError(
			`janus: email "${type.email}" did not name a string in validated ${type.name} fields — the schema must keep the e-mail field a required string`,
		);
	}
	if (
		normalizeEmail(address) === normalizeEmail(emailOf(type, user.fields) ?? '')
	) {
		throw new UserInvalidError(
			`${where}: the new e-mail is the user's current one — a change moves to another address; verifyEmail proves the current one`,
			{
				issues: [
					{ path: [type.email], message: 'is the current e-mail of the user' },
				],
				userType: type.name,
			},
		);
	}
	return address;
}

/**
 * Issues the token for the validated new `address`, bound to the address the
 * user has now, and spends the user's earlier ones.
 */
export async function issueChangeEmailToken(
	context: Context,
	type: ResolvedType,
	user: UserRecord,
	address: string,
): Promise<IssuedToken> {
	const secret = mintSecret();
	const { expiresAt } = await issueOneTime(context, {
		kind: 'changeEmail',
		userId: user.id,
		address,
		ttlMs: context.config.tokenTtlMs.changeEmail,
		secret,
		boundHash: formerHash(secret, emailOf(type, user.fields)),
	});
	// One live link per user: issued first, spent after, as for a reset, so
	// requests that race leave at most one live — never one each.
	await context.store.tokens.spendUserTokens(
		user.id,
		'changeEmail',
		context.clock.now(),
		hashSecret(secret),
	);
	return { token: secret, email: address, expiresAt };
}

/**
 * Refuses a token asked from an address the user has left: the link would
 * move somebody who is no longer where the request came from.
 */
export function refuseMoved(
	type: ResolvedType,
	user: UserRecord,
	token: TokenRecord,
	secret: string,
	where: string,
): void {
	if (token.codeHash !== formerHash(secret, emailOf(type, user.fields))) {
		throw new TokenError(
			'TOKEN_STALE',
			`${where}: the token was asked from an e-mail the user no longer has`,
			{ operation: where, userId: user.id, userType: type.name },
		);
	}
}

/**
 * Spends a change's token and says why it cannot be used, when it cannot. A
 * user gone since, or of another type, is as good as no token; a user who
 * moved since the link was asked is stale.
 *
 * With `type` null the user's own type answers — whichever it is, provided it
 * has an e-mail: a page that does not know the type confirms the link, and
 * `type` in the answer is the one the user has.
 */
export async function redeemChangeEmailToken(
	context: Context,
	type: ResolvedType | null,
	secret: string,
	where: string,
): Promise<{ token: TokenRecord; user: UserRecord; type: ResolvedType }> {
	const token = await spendOneTime(
		context,
		secret,
		'changeEmail',
		where,
		'token',
	);
	const { user, type: owner } = await ownerOf(context, type, token, where);
	// A type with no e-mail field has no changeEmail: its users are as good as
	// unknown here, as through their own type, which has no such flow.
	if (emailOf(owner, user.fields) === null)
		throw unknownOneTime(where, 'token');

	refuseMoved(owner, user, token, secret, where);
	return { token, user, type: owner };
}
