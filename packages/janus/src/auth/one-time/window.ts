/**
 * Attempts counted by the store in fixed windows of the clock — what bounds
 * the codes tried at an app outside a sign-in (`second-factor/app-code-attempts.ts`)
 * and the passwords tried at one login (`../sign-in-attempts.ts`).
 *
 * **No port of its own.** The count is a one-time token of kind
 * `secondFactor`, counted by `countAttempt` like a challenge's: one
 * conditional write per attempt, never read then written, so twenty guesses
 * at once are twenty distinct counts. Its secret is never given out: each
 * caller names it by a keyed hash of what the count is for, so it cannot be
 * redeemed as a challenge.
 *
 * A token once spent counts nothing more. So the count is a **chain** of
 * links, and what a spent link means is the caller's to say: `carry`, and the
 * next link carries on from the attempts it holds — a password written, which
 * spends every `secondFactor` token of the user, buys no guess; `restart`,
 * and the next link starts from zero — a sign-in that succeeded spends the
 * link it counted on, and the login's count starts again.
 */

import type { Context } from '../context';
import type { TokenRecord } from '../port/types';

/**
 * More links than this in one window, for `carry`: more passwords written
 * than guesses, and the count is past any limit.
 */
export const MAX_LINKS = 32;

/**
 * Probes enough for 2^30 sign-ins in one window, for `restart`: past them, the
 * store answers links nobody stored, and the count fails closed.
 */
const MAX_PROBES = 64;

/** What {@link countInWindow} counts, and how. */
export interface AttemptWindow {
	/** How long one window lasts, in milliseconds. */
	readonly windowMs: number;
	/** What a spent link means: its attempts carried on, or a count started again. */
	readonly spent: 'carry' | 'restart';
	/** The `userId` each link is stored under. */
	readonly userId: string;
	/** A link's token hash in one window: never given out, and never a secret. */
	readonly linkHash: (window: number, link: number) => string;
	/** What to throw when a link is gone right after it was stored, or the links never end. */
	readonly vanished: () => Error;
}

/** One attempt, counted. */
export interface CountedAttempt {
	/** The attempts of this window, this one included. */
	readonly attempts: number;
	/** The link it was counted on — what spending restarts — or `null` past the last one. */
	readonly link: string | null;
	/** When the window ends, in milliseconds since the epoch. */
	readonly endsAt: number;
}

interface Links {
	readonly context: Context;
	readonly counting: AttemptWindow;
	readonly window: number;
	readonly now: number;
	readonly expiresAt: number;
}

/** Counts one attempt in the current window, before anything is compared. */
export async function countInWindow(
	context: Context,
	counting: AttemptWindow,
): Promise<CountedAttempt> {
	const now = context.clock.now().getTime();
	const window = Math.floor(now / counting.windowMs);
	// A window of slack: a store whose clock runs ahead of this one must not
	// drop a link before its window ends. The window is in the hash, so a
	// link never counts for the next one.
	const expiresAt = (window + 2) * counting.windowMs;
	const links = { context, counting, window, now, expiresAt };
	const counted =
		counting.spent === 'carry'
			? await countCarrying(links)
			: await countRestarting(links);
	return { ...counted, endsAt: (window + 1) * counting.windowMs };
}

/** Every link from the first, each spent one's attempts carried on. */
async function countCarrying(
	links: Links,
): Promise<Omit<CountedAttempt, 'endsAt'>> {
	let carried = 0;
	for (let link = 0; link < MAX_LINKS; link += 1) {
		const hash = links.counting.linkHash(links.window, link);
		const counted = await countLink(links, hash);
		const attempts = carried + counted.attempts;
		if (counted.spentAt === null) return { attempts, link: hash };
		carried = attempts;
	}
	return { attempts: Number.POSITIVE_INFINITY, link: null };
}

/**
 * The one unspent link, found by probing rather than walked to: a link is
 * stored only once the one before it is spent, so every link below it is
 * spent and none above it is stored. Probing a spent link or one never
 * stored writes nothing; probing the unspent one counts the attempt. So a
 * login signed in to a thousand times in one window costs twenty probes,
 * not a thousand — and no number of sign-ins turns the count off.
 */
async function countRestarting(
	links: Links,
): Promise<Omit<CountedAttempt, 'endsAt'>> {
	const tokens = links.context.store.tokens;
	let spent = -1;
	let absent = Number.POSITIVE_INFINITY;
	for (let probes = 0; probes < MAX_PROBES; probes += 1) {
		const next = absent === spent + 1;
		const link = next
			? absent
			: absent === Number.POSITIVE_INFINITY
				? 2 * spent + 2
				: Math.floor((spent + absent) / 2);
		const hash = links.counting.linkHash(links.window, link);
		const counted = next
			? await insertLink(links, hash)
			: await tokens.countAttempt(hash, 'secondFactor');
		if (counted === null) absent = link;
		else if (counted.spentAt === null) {
			return { attempts: counted.attempts, link: hash };
		} else {
			spent = link;
			// Spent by a sign-in that raced this one: look further on.
			if (absent <= spent) absent = Number.POSITIVE_INFINITY;
		}
	}
	// A store whose links never end: it cannot be counting what it stores.
	throw links.counting.vanished();
}

/** One attempt on one link: inserted on the first, and counted. */
async function countLink(
	links: Links,
	tokenHash: string,
): Promise<TokenRecord> {
	const tokens = links.context.store.tokens;
	const counted = await tokens.countAttempt(tokenHash, 'secondFactor');
	return counted ?? insertLink(links, tokenHash);
}

/** A link stored — idempotent: of two first attempts at once, one inserts — and counted. */
async function insertLink(
	links: Links,
	tokenHash: string,
): Promise<TokenRecord> {
	const tokens = links.context.store.tokens;
	await tokens.insertToken({
		tokenHash,
		kind: 'secondFactor',
		userId: links.counting.userId,
		address: '',
		codeHash: null,
		attempts: 0,
		expiresAt: new Date(links.expiresAt),
		spentAt: null,
		createdAt: new Date(links.now),
	});
	const inserted = await tokens.countAttempt(tokenHash, 'secondFactor');
	if (inserted !== null) return inserted;
	throw links.counting.vanished();
}
