import { createHmac, hkdfSync } from 'node:crypto';
import { StoreConflict, TokenError } from '../../errors/janus-error';
import type { Context } from '../context';
import { CODE_ATTEMPTS, countInWindow } from '../one-time';
import type { UserRecord } from '../port/types';
import type { Sealer } from '../sealing';
import { hashSecret } from '../secrets';

/**
 * The attempts at an app's code outside a sign-in — `regenerateRecoveryCodes`
 * and a step-up confirmed with the app — counted by the store, in one count
 * both share: the same {@link CODE_ATTEMPTS} a challenge takes, per user and
 * per window, so a stolen session cannot guess the app's code at leisure,
 * nor buy more guesses by switching from one to the other.
 *
 * Counted in an attempt window (`../one-time/window.ts`): a `secondFactor`
 * token named by a keyed hash of what the count is for, so nobody without
 * the sealing keys can name it — nor redeem it as a challenge.
 *
 * What it is for decides when it starts again: the **window**, a fixed
 * {@link APP_CODE_WINDOW_MS} slice of the clock, and the factor's
 * `lastStep`, which **any code accepted** moves — a regenerate that
 * succeeded starts the count again, and so does a sign-in finished with the
 * app.
 *
 * Writing a password spends every `secondFactor` token of the user, this one
 * included. So a spent link **carries** its attempts on to the next — a
 * password written between guesses buys none.
 */

/** How long the attempts of one window last: fifteen minutes. */
export const APP_CODE_WINDOW_MS = 15 * 60_000;

const WINDOW_MINUTES = APP_CODE_WINDOW_MS / 60_000;

/**
 * What the key is derived for: never the key that seals a secret itself.
 * Named after the first flow that counted, and kept: renamed, every count
 * in progress would start over.
 */
const PURPOSE = 'janus/second-factor/regenerate-attempts/v1';

const derived = new WeakMap<Sealer, Buffer>();

function counterKey(sealer: Sealer): Buffer {
	let key = derived.get(sealer);
	if (key === undefined) {
		const secret = sealer.keys.get(sealer.sealWith) as Buffer;
		key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), PURPOSE, 32));
		derived.set(sealer, key);
	}
	return key;
}

/** A link's token hash: its secret is never given out, nor stored. */
function linkHash(
	sealer: Sealer,
	record: UserRecord,
	window: number,
	link: number,
): string {
	const parts = [
		record.id,
		String(window),
		String(record.secondFactor?.lastStep ?? ''),
		String(link),
	];
	return hashSecret(
		createHmac('sha256', counterKey(sealer))
			.update(parts.join('\u0000'))
			.digest('base64url'),
	);
}

/**
 * Counts one attempt at the app's code — to regenerate the user's recovery
 * codes, or to confirm a step-up — before the code is compared, and
 * answers how many are left. Past the last one, it refuses — the right
 * code included — until the window ends.
 */
export async function countAppCodeAttempt(
	context: Context,
	sealer: Sealer,
	record: UserRecord,
	where: string,
): Promise<number> {
	const { attempts } = await countInWindow(context, {
		windowMs: APP_CODE_WINDOW_MS,
		spent: 'carry',
		userId: record.id,
		linkHash: (window, link) => linkHash(sealer, record, window, link),
		// Gone right after it was stored: the user was deleted meanwhile.
		vanished: () =>
			new StoreConflict(
				'version',
				`${where}: the user changed while the code was checked — read it again and retry`,
				{
					userId: record.id,
					expectedVersion: record.version,
					operation: where,
				},
			),
	});
	if (attempts > CODE_ATTEMPTS) {
		throw new TokenError(
			'CODE_INVALID',
			`${where}: too many codes tried — wait for the next ${WINDOW_MINUTES}-minute window`,
			{
				operation: where,
				userId: record.id,
				userType: record.type,
				attemptsLeft: 0,
			},
		);
	}
	return CODE_ATTEMPTS - attempts;
}
