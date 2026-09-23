/**
 * Where `now` comes from.
 *
 * Injected rather than read from `Date` directly, for one practical reason:
 * every expiry in this package — sessions, one-time tokens, refresh windows —
 * is a comparison against the current time, and a spec that has to move the
 * real clock to test one is a spec that needs fake timers, leaks them, and
 * fails differently under load. A `Clock` makes those specs synchronous and
 * exact.
 *
 * It is also the seam an application needs if it ever has to reason about a
 * store's clock rather than its own: MongoDB stamps a TTL against the server's
 * time, not the process's.
 */
export interface Clock {
	now(): Date;
}

/** The process's own clock. The default everywhere. */
export const systemClock: Clock = {
	now: () => new Date(),
};

/**
 * A clock a spec drives by hand.
 *
 * Shipped rather than kept in `test/`: a consumer writing their own tests
 * against this package needs exactly this, and writing it again is how two
 * subtly different versions of "advance time" come to exist.
 */
export function fixedClock(start: Date | number = 0): Clock & {
	advance(ms: number): void;
	set(at: Date | number): void;
} {
	let ms = start instanceof Date ? start.getTime() : start;

	return {
		now: () => new Date(ms),
		advance: (by) => {
			ms += by;
		},
		set: (at) => {
			ms = at instanceof Date ? at.getTime() : at;
		},
	};
}
