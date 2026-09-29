/**
 * What the two sign-ins by e-mail share — a code typed back
 * (`sign-in-code.ts`) and a link followed (`magic-link.ts`): who may be sent
 * one, keeping only the last one live, and how a redeemed one ends — the
 * e-mail proved, then the same session or second-factor challenge a
 * password opens.
 */

import { UserInactiveError } from '../errors/janus-error';
import type { ResolvedType } from './config';
import { type AnyUser, type Context, holderOfEmail } from './context';
import { proveFirstEmail } from './first-proof';
import { refuseStale } from './one-time';
import type { TokenKind, TokenRecord, UserRecord } from './port/types';
import { hashSecret } from './secrets';
import type { SignInResult } from './types';

/** What a sign-in answers once the user proved who they are: `secondFactor.finish`. */
export type Finish = (
	record: UserRecord,
	where: string,
) => Promise<SignInResult<AnyUser>>;

/**
 * The user of this type holding `email`, when they may be sent a sign-in:
 * `null` for nobody, and for an inactive user — the same answer, so the
 * caller cannot tell them apart either.
 */
export async function signInHolder(
	context: Context,
	type: ResolvedType,
	email: string,
): Promise<UserRecord | null> {
	const record = await holderOfEmail(context, type, email);
	return record === null || !record.active ? null : record;
}

/**
 * Spends every other unspent token of this kind the user holds, sparing the
 * one just issued. Issued first, spent after, so requests that race leave
 * at most one live — maybe none, and the visitor asks again — never one each.
 */
export async function keepOnlyLatest(
	context: Context,
	userId: string,
	kind: TokenKind,
	secret: string,
): Promise<void> {
	await context.store.tokens.spendUserTokens(
		userId,
		kind,
		context.clock.now(),
		hashSecret(secret),
	);
}

/**
 * Ends a sign-in by e-mail whose token is spent: refuses an e-mail changed
 * since it was sent and an inactive user, proves the e-mail — it reached the
 * inbox — and finishes as a password would.
 *
 * **An e-mail proved for the first time drops the password and revokes every
 * session** before the new one opens (`./first-proof`): whoever signed up
 * with the address without holding its inbox keeps nothing. An e-mail
 * already proved changes nothing. The proof is written under the version
 * read, so an address changed since is not the one proved: a
 * `VERSION_CONFLICT` then, with the token spent.
 */
export async function finishEmailSignIn(
	context: Context,
	type: ResolvedType,
	finish: Finish,
	signIn: {
		readonly user: UserRecord;
		readonly token: TokenRecord;
		readonly where: string;
		readonly noun: 'token' | 'code';
	},
): Promise<SignInResult<AnyUser>> {
	const { user, token, where, noun } = signIn;
	refuseStale(type, user, token, where, noun);
	if (!user.active) {
		throw new UserInactiveError(`${where}: the user is inactive`, {
			userId: user.id,
			userType: type.name,
		});
	}

	if (user.emailVerifiedAt !== null) return finish(user, where);
	return finish(await proveFirstEmail(context, type, user, where), where);
}
