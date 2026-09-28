import type { At } from './at';
import type { ResolvedType } from './config';
import { type AnyUser, type Context, findRecord, toUser } from './context';
import {
	type Finish,
	finishEmailSignIn,
	keepOnlyLatest,
	signInHolder,
} from './email-sign-in';
import { issueOneTime, spendOneTime, unknownOneTime } from './one-time';
import type { IssuedToken, MagicLinkApi, SignInResult } from './types';

/**
 * Signing in with a link sent to the user's e-mail: no password, and the
 * link proves the address — a sign-in code with nothing to type.
 *
 * The token is 32 random bytes, so there is nothing to guess and no attempt
 * to count: redeeming it is one conditional write, and of two redemptions
 * at once exactly one signs in. **At most one link is live per user**, as
 * for a sign-in code: `request` spends every other once it issued its own.
 * A token of its own kind, `magicLink`, so a sign-in code's challenge — which
 * the visitor holds — is never a link, nor a link a challenge.
 *
 * Whoever opens the link signs in, in the browser that opened it: the
 * application confirms it from a `POST`, never from the `GET` of the link,
 * which a mail scanner follows too.
 */
export function magicLinkFlows(
	context: Context,
	type: ResolvedType,
	at: At,
	finish: Finish,
): MagicLinkApi<AnyUser, SignInResult<AnyUser>>['magicLink'] {
	return {
		async request(email) {
			return requestLink(context, type, String(email));
		},

		async confirm(token) {
			return confirmLink(
				context,
				type,
				finish,
				String(token),
				at('magicLink.confirm'),
			);
		},
	};
}

/** Issues a link's token for the holder of `email`, and spends every other they had. */
async function requestLink(
	context: Context,
	type: ResolvedType,
	email: string,
): Promise<(IssuedToken & { readonly user: AnyUser }) | null> {
	// Nobody, and an inactive user, get the same answer: no link.
	const record = await signInHolder(context, type, email);
	if (record === null) return null;

	const address = String(record.fields[type.email]);
	const { secret, expiresAt } = await issueOneTime(context, {
		kind: 'magicLink',
		userId: record.id,
		address,
		ttlMs: context.config.tokenTtlMs.magicLink,
	});
	// One live link per user: the ones sent before stop working.
	await keepOnlyLatest(context, record.id, 'magicLink', secret);
	return { token: secret, email: address, expiresAt, user: toUser(record) };
}

/** Spends a link's token, proves the e-mail, and finishes the sign-in. */
async function confirmLink(
	context: Context,
	type: ResolvedType,
	finish: Finish,
	secret: string,
	where: string,
): Promise<SignInResult<AnyUser>> {
	// Spent first, whatever follows: a link is redeemed once, and a refused
	// one — stale, inactive, another type's — cannot be tried again.
	const token = await spendOneTime(
		context,
		secret,
		'magicLink',
		where,
		'token',
	);
	const user = await findRecord(context, token.userId, type.name);
	if (user === null) throw unknownOneTime(where, 'token');

	return finishEmailSignIn(context, type, finish, {
		user,
		token,
		where,
		noun: 'token',
	});
}
