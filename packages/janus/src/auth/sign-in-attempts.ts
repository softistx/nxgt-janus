/**
 * The passwords tried at one login, counted by the store per window —
 * `janus({ signIn: { throttle } })`, ten per fifteen minutes by default.
 * Past the last one, `signIn` answers `CREDENTIALS_INVALID` with
 * `retryAfter`, the right password included, until the window ends. **Nothing
 * locks** past a window — but somebody who keeps trying a login keeps its
 * password sign-in shut, window after window: a per-client limit is the
 * application's, and a sign-in code still opens the account.
 *
 * Counted per login, **known or not**: an unknown login is counted as a
 * registered one is, so the throttle does not tell them apart. Counted
 * before anything is looked up or compared, so of twenty guesses at once,
 * exactly as many as the limit are compared.
 *
 * Counted in an attempt window (`one-time/window.ts`), in `secondFactor`
 * tokens stored under no user: the `userId` of each is a keyed hash of the
 * login, never the login. The key is derived from the sealing keys when
 * `secondFactor` is configured; without them it is a fixed one, and the hash
 * only keeps the login out of plain sight — safe because a `secondFactor`
 * token is redeemed only by the second factor's flows, which do not exist
 * without the keys. A sign-in that opens a session spends the link it
 * counts on, and the login's count **restarts** from zero.
 *
 * A store that cannot count throws `STORE_FAILED`: never a refusal, and
 * never a sign-in let through uncounted.
 */

import { CredentialError, StoreFailure } from '../errors/janus-error';
import type { ResolvedType } from './config';
import type { Context } from './context';
import { derivedKey, keyedHash } from './derived-keys';
import { type CountedAttempt, countInWindow } from './one-time';
import type { UserRecord } from './port/types';
import { hashSecret } from './secrets';

/** What the key is derived for. Renamed, every count in progress would start over. */
const PURPOSE = 'janus/sign-in/attempts/v1';

/** The key without sealing keys: fixed, so every process counts alike. */
const UNSEALED = Buffer.from(PURPOSE);

function counterKey(context: Context): Buffer {
	const sealer = context.config.secondFactor?.sealer;
	// The first key is always held: resolveSealer names it from the keys.
	return sealer === undefined
		? UNSEALED
		: (derivedKey(sealer, PURPOSE) as Buffer);
}

const keyed = (key: Buffer, parts: readonly string[]): string =>
	keyedHash(key, parts).toString('base64url');

/** One attempt counted at `login`, already normalised, or `null` with the throttle off. */
async function countLogin(
	context: Context,
	type: ResolvedType,
	login: string,
	where: string,
): Promise<CountedAttempt | null> {
	const throttle = context.config.signInThrottle;
	if (throttle === null) return null;
	const key = counterKey(context);
	const loginKey = keyed(key, [type.name, login]);
	return countInWindow(context, {
		windowMs: throttle.windowMs,
		spent: 'restart',
		userId: loginKey,
		linkHash: (window, link) =>
			hashSecret(keyed(key, [loginKey, String(window), String(link)])),
		// A store that lost what it just stored cannot count: an outage.
		vanished: () =>
			new StoreFailure(
				`${where}: the store dropped the attempts it had just stored`,
				{ slot: 'tokens', operation: 'countAttempt' },
			),
	});
}

/**
 * Counts one password tried at `login` — already normalised — before it is
 * looked up, and refuses past the last one: the right password included.
 */
export async function countSignInAttempt(
	context: Context,
	type: ResolvedType,
	login: string,
	where: string,
): Promise<void> {
	const counted = await countLogin(context, type, login, where);
	const limit = context.config.signInThrottle?.attempts;
	if (counted === null || limit === undefined || counted.attempts <= limit) {
		return;
	}
	const now = context.clock.now().getTime();
	throw new CredentialError(
		'CREDENTIALS_INVALID',
		`${where}: too many passwords tried at this login — wait for the next window`,
		{
			reason: 'throttled',
			userType: type.name,
			retryAfter: Math.max(1, Math.ceil((counted.endsAt - now) / 1000)),
		},
	);
}

/**
 * Starts the user's count again, once a sign-in opens a session: after the
 * password alone, or after the second factor's code — never after the
 * password of a user whose second factor is still to come, so knowing the
 * password buys no more challenges. It counts one attempt on the current
 * link, and spends it: the next one counts from zero.
 */
export async function restartSignInCount(
	context: Context,
	type: ResolvedType,
	record: UserRecord,
	where: string,
): Promise<void> {
	const rule = type.password;
	const login = rule === null ? undefined : record.fields[rule.login];
	if (rule === null || typeof login !== 'string') return;
	const counted = await countLogin(context, type, rule.normalize(login), where);
	if (counted?.link == null) return;
	await context.store.tokens.consumeToken(
		counted.link,
		'secondFactor',
		context.clock.now(),
	);
}
