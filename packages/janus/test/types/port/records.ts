/**
 * What a record a store answers must hold: readonly, JSON fields, and every
 * field present — null when absent, 0 when uncounted, never left out. Cases
 * 12, 13, 15, 18, 19 and 20 of the twenty-two — see `fixtures.ts`.
 */

import type { TokenRecord, UserRecord } from '../../../src/auth/port/types';
import { record, token } from './fixtures';

// ── 12. Editing a record a store answered ──────────────────────────────────
// @ts-expect-error active is readonly
record.active = false;

// ── 13. A field a store cannot round-trip ──────────────────────────────────
// A Date survives MongoDB and not a JSON column: an adapter could pass on one
// database and corrupt fields on the next.
const dateField: UserRecord = {
	...record,
	// @ts-expect-error fields are JSON, and a Date is not
	fields: { born: new Date() },
};

// ── 15. A password left undefined rather than null ─────────────────────────
// Rule 2 on the one field where a missing value would read as "no password"
// rather than as "the store forgot".
const missingPassword: UserRecord = {
	...record,
	// @ts-expect-error password is present, and null when absent
	password: undefined,
};

// ── 18. A second factor left out of a record ──────────────────────────────
// Rule 2 again: a store that forgot the field — a document written before it
// existed, forwarded unmapped — would read as "no second factor", and a
// sign-in would skip it.
const { secondFactor: _forgotten, ...withoutSecondFactor } = record;
// @ts-expect-error a user with no second factor holds null, never nothing
const missingSecondFactor: UserRecord = withoutSecondFactor;

// ── 19. A token forwarded without its attempts ─────────────────────────────
// A toToken that passes an old document through would answer no count, and
// the limit on guesses would compare against undefined.
const { attempts: _uncounted, ...withoutAttempts } = token;
// @ts-expect-error a token carries its attempts, 0 when none
const uncountedToken: TokenRecord = withoutAttempts;

// ── 20. A token forwarded without its code hash ────────────────────────────
const { codeHash: _unhashed, ...withoutCodeHash } = token;
// @ts-expect-error a token carries its code hash, null when it has none
const unhashedToken: TokenRecord = withoutCodeHash;

// ── And the shape that MUST keep compiling ──────────────────────────────────

// Fields nest, and hold arrays and numbers.
const nestedFields: UserRecord = {
	...record,
	fields: { name: { first: 'Ada' }, tags: ['a', 1, true, null] },
};

export const checked = {
	refused: [
		dateField,
		missingPassword,
		missingSecondFactor,
		uncountedToken,
		unhashedToken,
	],
	allowed: [nestedFields],
};
