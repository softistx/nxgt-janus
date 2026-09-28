/**
 * The passwords tried at one login, counted by the store per window —
 * `janus({ signIn: { throttle } })`, ten per fifteen minutes by default.
 * Past the last one, `signIn` answers `CREDENTIALS_INVALID` with
 * `retryAfter`, the right password included, until the window ends. **Nothing
 * locks**: nobody can block an account for longer than a window.
 *
 * Counted per login, **known or not**: an unknown login is counted as a
 * registered one is, so the throttle does not tell them apart. Counted
 * before anything is looked up or compared, so of twenty guesses at once,
 * exactly as many as the limit are compared.
 *
 * Counted in an attempt window (`../one-time/window.ts`), in `secondFactor`
 * tokens stored under no user: the `userId` of each is a keyed hash of the
 * login, never the login. The key is derived from the sealing keys when
 * `secondFactor` is configured; without them it is a fixed one, and the hash
 * only keeps the login out of plain sight. A sign-in that succeeded spends
 * the link it counted on, and the login's count **restarts** from zero.
 *
 * A store that cannot count throws `STORE_FAILED`: never a refusal, and
 * never a sign-in let through uncounted.
 */

import { createHmac, hkdfSync } from 'node:crypto';
import { CredentialError, StoreFailure } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import type { Context } from '../context';
import { countInWindow } from '../one-time';
import type { Sealer } from '../sealing';
import { hashSecret } from '../secrets';

/** What the key is derived for. Renamed, every count in progress would start over. */
const PURPOSE = 'janus/sign-in/attempts/v1';

/** The key without sealing keys: fixed, so every process counts alike. */
const UNSEALED = Buffer.from(PURPOSE);

const derived = new WeakMap<Sealer, Buffer>();

function counterKey(context: Context): Buffer {
	const sealer = context.config.secondFactor?.sealer;
	if (sealer === undefined) return UNSEALED;
	let key = derived.get(sealer);
	if (key === undefined) {
		const secret = sealer.keys.get(sealer.sealWith) as Buffer;
		key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), PURPOSE, 32));
		derived.set(sealer, key);
	}
	return key;
}

function keyed(key: Buffer, parts: readonly string[]): string {
	return createHmac('sha256', key)
		.update(parts.join('\u0000'))
		.digest('base64url');
}

/** What a sign-in that succeeded calls: the login's count starts again. */
export type RestartCount = () => Promise<void>;

/**
 * Counts one password tried at `login` — already normalised — and answers
 * what restarts the count, or refuses past the last one. `null` when the
 * throttle is off.
 */
export async function countSignInAttempt(
	context: Context,
	type: ResolvedType,
	login: string,
	where: string,
): Promise<RestartCount | null> {
	const throttle = context.config.signInThrottle;
	if (throttle === null) return null;
	const key = counterKey(context);
	const loginKey = keyed(key, [type.name, login]);
	const counted = await countInWindow(context, {
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
	const now = context.clock.now();
	if (counted.attempts > throttle.attempts) {
		throw new CredentialError(
			'CREDENTIALS_INVALID',
			`${where}: too many passwords tried at this login — wait for the next window`,
			{
				reason: 'throttled',
				userType: type.name,
				retryAfter: Math.max(
					1,
					Math.ceil((counted.endsAt - now.getTime()) / 1000),
				),
			},
		);
	}
	const link = counted.link;
	return async () => {
		if (link === null) return;
		await context.store.tokens.consumeToken(
			link,
			'secondFactor',
			context.clock.now(),
		);
	};
}
