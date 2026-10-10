/**
 * The requests that hand out something to e-mail, counted by the store per
 * window — `janus({ mail: { throttle } })`, five per fifteen minutes by
 * default. Past the last one, the request answers `MAIL_THROTTLED` with
 * `retryAfter`, and **issues nothing**: no token is minted, so there is
 * nothing to send. Nothing locks past a window.
 *
 * **Each flow counts on its own**, so a loop on one — a sign-in link asked
 * for again and again — never shuts another, and what one address can be
 * sent is bounded per flow:
 *
 * - **per address**, for the requests anybody can make with an e-mail —
 *   `magicLink.request`, `signInCode.request`, `resetPassword.request`.
 *   Counted **before anything is looked up**, the address normalised, and
 *   whatever the user type: an address nobody holds is counted, and refused
 *   past the limit, as a registered one is, so being throttled never tells
 *   who has an account;
 * - **per user**, for the requests the application makes for a user it
 *   knows — `verifyEmail.send`, and `stepUp.request` when it e-mails a code.
 *   Nobody without the user's session or the application's call can spend
 *   that count, so a loop on their address leaves their own requests alone;
 *   and whatever addresses one user moves through, they are sent at most as
 *   many.
 *
 * Counted in an attempt window (`one-time/window.ts`), in `secondFactor`
 * tokens stored under no user: the `userId` of each is a keyed hash of the
 * flow and the address or the user (`counter-key.ts`). Nothing spends a
 * link, and one that is spent carries its count on: the count never starts
 * again before its window ends.
 *
 * A store that cannot count throws `STORE_FAILED`: never a refusal, and
 * never a request let through uncounted.
 */

import { MailThrottledError, StoreFailure } from '../errors/janus-error';
import { normalizeEmail, type ResolvedType } from './config';
import type { Context } from './context';
import { counterKey, keyed } from './counter-key';
import { countInWindow } from './one-time';
import { hashSecret } from './secrets';

/** What the key is derived for. Renamed, every count in progress would start over. */
const PURPOSE = 'janus/mail/requests/v1';

/** The flows that hand out something to e-mail, each counted on its own. */
export type MailFlow =
	| 'magicLink'
	| 'signInCode'
	| 'resetPassword'
	| 'verifyEmail'
	| 'stepUp';

/** Who a request is counted for: the address it names, or the user it is for. */
type Counted = { readonly address: string } | { readonly userId: string };

/**
 * Counts one request of `flow` for `email` — before it is looked up — and
 * refuses past the last one, whether anybody holds the address or not.
 */
export async function countMailByAddress(
	context: Context,
	type: ResolvedType,
	flow: MailFlow,
	email: string,
	where: string,
): Promise<void> {
	await countMail(
		context,
		type,
		flow,
		{ address: normalizeEmail(email) },
		where,
	);
}

/** Counts one request of `flow` for the user `userId`, and refuses past the last one. */
export async function countMailByUser(
	context: Context,
	type: ResolvedType,
	flow: MailFlow,
	userId: string,
	where: string,
): Promise<void> {
	await countMail(context, type, flow, { userId }, where);
}

async function countMail(
	context: Context,
	type: ResolvedType,
	flow: MailFlow,
	counted: Counted,
	where: string,
): Promise<void> {
	const throttle = context.config.mailThrottle;
	if (throttle === null) return;
	const key = counterKey(context, PURPOSE);
	const subject =
		'address' in counted
			? keyed(key, [flow, 'address', counted.address])
			: keyed(key, [flow, 'user', counted.userId]);
	const { attempts, endsAt } = await countInWindow(context, {
		windowMs: throttle.windowMs,
		spent: 'carry',
		userId: subject,
		linkHash: (window, link) =>
			hashSecret(keyed(key, [subject, String(window), String(link)])),
		// A store that lost what it just stored cannot count: an outage.
		vanished: () =>
			new StoreFailure(
				`${where}: the store dropped the requests it had just counted`,
				{ slot: 'tokens', operation: 'countAttempt' },
			),
	});
	if (attempts <= throttle.attempts) return;

	const now = context.clock.now().getTime();
	const byUser = 'userId' in counted;
	throw new MailThrottledError(
		`${where}: too many e-mails asked for this ${byUser ? 'user' : 'address'} — wait for the next window`,
		{
			userType: type.name,
			...(byUser ? { userId: counted.userId } : {}),
			retryAfter: Math.max(1, Math.ceil((endsAt - now) / 1000)),
		},
	);
}
