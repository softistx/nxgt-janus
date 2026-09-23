import { describe, expect, it } from 'bun:test';
import { isIdentityId, mintedAt, mintIdentityId } from './identity-id';

describe('mintIdentityId', () => {
	it('mints a UUIDv7: version 7, variant 10', () => {
		const id = mintIdentityId();

		expect(id).toHaveLength(36);
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(isIdentityId(id)).toBe(true);
	});

	it('sorts in creation order as a STRING, which is what the cursor relies on', () => {
		// The whole reason the core mints the id: the pagination cursor is the
		// last id, and the ordering is already total with one index.
		const ids = Array.from({ length: 500 }, () => mintIdentityId());

		expect([...ids].sort()).toEqual(ids);
	});

	it('is strictly increasing inside one millisecond', () => {
		// Two ids in the same millisecond would otherwise order by their random
		// tail — still a total order, but not creation order, so "newest first"
		// would be wrong for anything created in a burst. A signup storm is
		// exactly such a burst.
		const at = 1_700_000_000_000;
		const ids = Array.from({ length: 1_000 }, () => mintIdentityId(at));

		expect([...ids].sort()).toEqual(ids);
		expect(new Set(ids).size).toBe(1_000);
	});

	it('borrows the next millisecond rather than repeating one on overflow', () => {
		// More than 4096 in a millisecond, which no real application reaches.
		// A repeated id would break the cursor, so the timestamp goes a hair
		// ahead of the clock instead.
		const at = 1_700_000_100_000;
		const ids = Array.from({ length: 5_000 }, () => mintIdentityId(at));

		expect(new Set(ids).size).toBe(5_000);
		expect([...ids].sort()).toEqual(ids);
		expect(mintedAt(ids[4_999] as string).getTime()).toBeGreaterThan(at);
	});

	it('keeps ids ordered when the clock steps backwards', () => {
		// An NTP step, or a container resumed. Ids stay ordered even though they
		// stop matching the wall clock for a moment.
		const forward = mintIdentityId(1_700_000_200_000);
		const backward = mintIdentityId(1_700_000_100_000);

		expect(backward > forward).toBe(true);
	});
});

describe('isIdentityId', () => {
	it('refuses what this package could not have minted', () => {
		// An id arrives off a URL. One of the wrong shape is "no such identity",
		// which an adapter can answer WITHOUT reaching the store.
		expect(isIdentityId('')).toBe(false);
		expect(isIdentityId('abc')).toBe(false);
		expect(isIdentityId('507f1f77bcf86cd799439011')).toBe(false);
		// A valid UUIDv4 is not a valid identity id: the version nibble differs,
		// and a v4 would have no orderable prefix for the cursor.
		expect(isIdentityId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(false);
	});
});

describe('mintedAt', () => {
	it('reads the timestamp out of the id itself', () => {
		// Forward of every id this file has already minted, because the sequence
		// state is module-level and monotonic — see the next case.
		const at = Date.now() + 60_000;

		expect(mintedAt(mintIdentityId(at)).getTime()).toBe(at);
	});

	it('does not follow a clock that went backwards, and says so', () => {
		// The trap in this module, pinned rather than left for someone to hit:
		// `lastMs` is MODULE state, so passing a `now` earlier than an id already
		// minted in this process does not produce an earlier id. The last
		// millisecond is held and the sequence keeps counting, because a repeated
		// or decreasing id would break the pagination cursor — which is the whole
		// reason the core mints ids at all.
		//
		// The consequence for a caller: `now` steers ids forward, never back, and
		// `mintedAt` is therefore accurate to the millisecond and no further. A
		// test that needs a fixed instant wants `fixedClock`, not this argument.
		const ahead = mintIdentityId(Date.now() + 120_000);
		const behind = mintIdentityId(1_700_000_300_000);

		expect(behind > ahead).toBe(true);
		expect(mintedAt(behind).getTime()).toBeGreaterThanOrEqual(
			mintedAt(ahead).getTime(),
		);
	});
});
