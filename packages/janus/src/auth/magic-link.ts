import type { At } from './at';
import type { ResolvedType } from './config';
import { type AnyUser, type Context, toUser } from './context';
import { type DeviceHint, deviceHint } from './devices';
import { redeemEmailToken } from './email-flows/email-token';
import {
	type Finish,
	finishEmailSignIn,
	keepOnlyLatest,
	signInHolder,
} from './email-sign-in';
import { countMailByAddress } from './mail-requests';
import { issueOneTime } from './one-time';
import { sendOnce } from './prepared';
import type {
	IssuedToken,
	MagicLinkApi,
	PreparedRequest,
	SignInResult,
} from './types';

type IssuedLink = IssuedToken & { readonly user: AnyUser };

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
 *
 * `request` is `prepare`, then `send`: counted, then looked up and issued
 * (`prepared.ts`).
 */
export function magicLinkFlows(
	context: Context,
	type: ResolvedType,
	at: At,
	finish: Finish,
): MagicLinkApi<AnyUser, SignInResult<AnyUser>>['magicLink'] {
	return {
		async request(email) {
			const where = at('magicLink.request');
			return (await prepareLink(context, type, String(email), where)).send();
		},

		async prepare(email) {
			const where = at('magicLink.prepare');
			return prepareLink(context, type, String(email), where);
		},

		async confirm(token, options) {
			const where = at('magicLink.confirm');
			const device = deviceHint(context, options, where);
			return confirmLink(context, type, finish, String(token), where, device);
		},
	};
}

/**
 * Counts a link asked for `email` — before it is looked up: past the limit,
 * nobody and somebody are refused alike — and answers the `send` that
 * issues it, once.
 */
async function prepareLink(
	context: Context,
	type: ResolvedType,
	email: string,
	where: string,
): Promise<PreparedRequest<IssuedLink>> {
	await countMailByAddress(context, type, 'magicLink', email, where);
	return Object.freeze({
		send: sendOnce(where, () => issueLink(context, type, email)),
	});
}

/** Issues a link's token for the holder of `email`, and spends every other they had. */
async function issueLink(
	context: Context,
	type: ResolvedType,
	email: string,
): Promise<IssuedLink | null> {
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
	device: DeviceHint,
): Promise<SignInResult<AnyUser>> {
	// Spent first, whatever follows: a link is redeemed once, and a refused
	// one — stale, inactive, another type's — cannot be tried again.
	const { token, user } = await redeemEmailToken(
		context,
		type,
		'magicLink',
		secret,
		where,
	);

	return finishEmailSignIn(context, type, finish, {
		user,
		token,
		where,
		noun: 'token',
		device,
	});
}
