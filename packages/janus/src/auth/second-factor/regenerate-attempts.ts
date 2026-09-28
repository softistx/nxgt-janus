import { createHmac, hkdfSync } from 'node:crypto';
import { StoreConflict, TokenError } from '../../errors/janus-error';
import type { Context } from '../context';
import { CODE_ATTEMPTS } from '../one-time';
import type { TokenRecord, UserRecord } from '../port/types';
import type { Sealer } from '../sealing';
import { hashSecret } from '../secrets';

/**
 * The attempts at `regenerateRecoveryCodes`, counted by the store — the same
 * {@link CODE_ATTEMPTS} a challenge takes, per user and per window, so a
 * stolen session cannot guess the app's code at leisure.
 *
 * **No port of its own.** The count is a one-time token of kind
 * `secondFactor`, counted by `countAttempt` like a challenge's: one
 * conditional write per attempt, never read then written. Its secret is
 * never given out; it is a keyed hash of what the count is for, so nobody
 * without the sealing keys can name it — nor redeem it as a challenge.
 *
 * What it is for decides when it starts again: the **window**, a fixed
 * {@link REGENERATE_WINDOW_MS} slice of the clock, and the factor's
 * `lastStep`, which **any code accepted** moves — a regenerate that
 * succeeded starts the count again, and so does a sign-in finished with the
 * app.
 *
 * Writing a password spends every `secondFactor` token of the user, this one
 * included, and a spent token counts nothing more. So the count is a chain:
 * a spent link keeps the attempts it holds, and the next one carries on
 * from them — a password written between guesses buys none.
 */

/** How long the attempts of one window last: fifteen minutes. */
export const REGENERATE_WINDOW_MS = 15 * 60_000;

/** What the key is derived for: never the key that seals a secret itself. */
const PURPOSE = 'janus/second-factor/regenerate-attempts/v1';

/** More links than this in one window is more passwords written than guesses. */
const MAX_LINKS = 32;

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
 * Counts one attempt at regenerating the user's recovery codes, before the
 * code is compared, and answers how many are left. Past the last one, it
 * refuses — the right code included — until the window ends.
 */
export async function countRegenerateAttempt(
	context: Context,
	sealer: Sealer,
	record: UserRecord,
	where: string,
): Promise<number> {
	const now = context.clock.now().getTime();
	const window = Math.floor(now / REGENERATE_WINDOW_MS);
	const times = { now, expiresAt: (window + 1) * REGENERATE_WINDOW_MS };
	let spent = 0;
	for (let link = 0; link < MAX_LINKS; link += 1) {
		const hash = linkHash(sealer, record, window, link);
		const counted = await countLink(context, hash, record, times, where);
		const attempts = spent + counted.attempts;
		if (counted.spentAt === null) return attemptsLeft(attempts, record, where);
		spent = attempts;
	}
	return attemptsLeft(Number.POSITIVE_INFINITY, record, where);
}

/** One attempt on one link: inserted on the first, and counted. */
async function countLink(
	context: Context,
	tokenHash: string,
	record: UserRecord,
	times: { readonly now: number; readonly expiresAt: number },
	where: string,
): Promise<TokenRecord> {
	const tokens = context.store.tokens;
	const counted = await tokens.countAttempt(tokenHash, 'secondFactor');
	if (counted !== null) return counted;
	// Idempotent: of two first attempts at once, one inserts, both count.
	await tokens.insertToken({
		tokenHash,
		kind: 'secondFactor',
		userId: record.id,
		address: '',
		codeHash: null,
		attempts: 0,
		expiresAt: new Date(times.expiresAt),
		spentAt: null,
		createdAt: new Date(times.now),
	});
	const inserted = await tokens.countAttempt(tokenHash, 'secondFactor');
	if (inserted !== null) return inserted;
	// Gone right after it was stored: the user was deleted meanwhile.
	throw new StoreConflict(
		'version',
		`${where}: the user changed while the code was checked — read it again and retry`,
		{ userId: record.id, expectedVersion: record.version, operation: where },
	);
}

/** Attempts left after `attempts`, or the refusal past the last one. */
function attemptsLeft(
	attempts: number,
	record: UserRecord,
	where: string,
): number {
	if (attempts > CODE_ATTEMPTS) {
		throw new TokenError(
			'CODE_INVALID',
			`${where}: too many codes tried — wait for the next 15-minute window`,
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
