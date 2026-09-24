/**
 * An id — of a user, a session: a UUIDv7, lowercase, hyphenated.
 *
 * **The core mints it, not the store**, and that decision pays for itself three
 * times over:
 *
 *   - A UUIDv7 leads with a 48-bit millisecond timestamp, so ids sort in
 *     creation order as strings. The pagination cursor is therefore *the last
 *     id* — one index on the id, and the ordering is already total. A
 *     store-minted id would need a `createdAt` index plus the id as a tiebreak,
 *     because a timestamp alone is not a total order, and an opaque cursor per
 *     adapter.
 *   - `insertUser` becomes **idempotent under retry**: the id is decided
 *     before the call, so a retry after a timeout writes the same row rather
 *     than a second user.
 *   - Every adapter reports the same shape, so moving an application from one
 *     adapter to another is a copy rather than a rewrite of every stored
 *     reference.
 *
 * The price, stated plainly: an adapter cannot reuse an existing numeric primary
 * key. It gets a `uuid` column, or a 36-character string, and the monotonic
 * prefix gives it the index locality a UUIDv4 destroys.
 */
export type Id = string;

const HEX: readonly string[] = Array.from({ length: 256 }, (_, i) =>
	i.toString(16).padStart(2, '0'),
);

let lastMs = -1;
let sequence = 0;

/**
 * The 12-bit sequence UUIDv7 keeps for ordering inside one millisecond.
 *
 * RFC 9562 calls this the "replace leftmost random bits with an increased clock
 * precision" method. Without it, two ids minted in the same millisecond order
 * by their random tail — still a total order, which is all the port requires,
 * but not creation order, and "newest first" would then be wrong for anything
 * created in a burst. A signup storm is exactly such a burst.
 */
const SEQUENCE_MAX = 0xfff;

/**
 * A fresh id.
 *
 * Strictly increasing: within one millisecond it uses the sequence, and if that
 * overflows — more than 4096 ids in a millisecond, which no real
 * application reaches — it borrows the next millisecond rather than repeating
 * one. Across processes the 62 random bits of the tail are what keep two machines
 * apart.
 */
export function mintId(now: number = Date.now()): Id {
	let ms = now;

	if (ms === lastMs) {
		sequence += 1;
		if (sequence > SEQUENCE_MAX) {
			// Borrow from the next millisecond. This keeps ids strictly
			// increasing at the cost of a timestamp a hair ahead of the clock,
			// which is the right trade: a repeated id would break the cursor.
			ms = lastMs + 1;
			sequence = 0;
		}
	} else if (ms > lastMs) {
		sequence = 0;
	} else {
		// The clock went backwards — an NTP step, or a container resumed. Hold
		// the last millisecond and keep counting, so ids stay ordered even
		// though they stop matching the wall clock for a moment.
		ms = lastMs;
		sequence += 1;
		if (sequence > SEQUENCE_MAX) {
			ms = lastMs + 1;
			sequence = 0;
		}
	}

	lastMs = ms;

	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes.subarray(8));

	bytes[0] = (ms / 2 ** 40) & 0xff;
	bytes[1] = (ms / 2 ** 32) & 0xff;
	bytes[2] = (ms / 2 ** 24) & 0xff;
	bytes[3] = (ms / 2 ** 16) & 0xff;
	bytes[4] = (ms / 2 ** 8) & 0xff;
	bytes[5] = ms & 0xff;
	// Version 7 in the high nibble, the sequence's top 4 bits below it.
	bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
	bytes[7] = sequence & 0xff;
	// Variant 10 in the two high bits of byte 8; the rest of it stays random.
	bytes[8] = 0x80 | ((bytes[8] as number) & 0x3f);

	return `${HEX[bytes[0] as number]}${HEX[bytes[1] as number]}${HEX[bytes[2] as number]}${HEX[bytes[3] as number]}-${HEX[bytes[4] as number]}${HEX[bytes[5] as number]}-${HEX[bytes[6] as number]}${HEX[bytes[7] as number]}-${HEX[bytes[8] as number]}${HEX[bytes[9] as number]}-${HEX[bytes[10] as number]}${HEX[bytes[11] as number]}${HEX[bytes[12] as number]}${HEX[bytes[13] as number]}${HEX[bytes[14] as number]}${HEX[bytes[15] as number]}`;
}

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Whether this string is an id this package could have minted.
 *
 * Used by an adapter to answer `null` for a malformed id **without reaching the
 * store**: an id arrives off a URL, and one of the wrong shape is "no such
 * user", not an outage and not a query. Rejecting it here also keeps a
 * hand-written id out of a store that would then hold something the cursor
 * cannot order.
 */
export function isId(value: string): boolean {
	return UUID_V7.test(value);
}

/**
 * When this id was minted, from the id itself.
 *
 * Offered because the timestamp is *in* the id, so a `createdAt` column is a
 * convenience rather than the truth — and an adapter that loses one can still
 * answer. It is not a substitute for `createdAt`: the sequence may have borrowed
 * a millisecond, and a clock that stepped backwards is held rather than
 * followed, so this is accurate to the millisecond and no further.
 */
export function mintedAt(id: Id): Date {
	const hex = id.replace(/-/g, '').slice(0, 12);
	return new Date(Number.parseInt(hex, 16));
}
