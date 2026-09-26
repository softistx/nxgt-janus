/**
 * What the store port refuses at COMPILE time, seen from the side of
 * the person implementing it.
 *
 * Checked by `tsc --noEmit`, never run — see `refusals.ts` for why a
 * `@ts-expect-error` is the unit of measurement. These are the mistakes a
 * stranger writing an adapter is likely to make, and each one would otherwise
 * surface as a conformance failure at best, and at worst as an outage reported
 * as "no such account".
 *
 * **Twenty-one plausible mistakes, twenty-one refused.** Add a case whenever the port
 * gains something it should refuse; never delete one to make a change pass.
 */

import { createMemoryStores } from '../../src/auth/port/memory';
import type {
	JanusStores,
	SessionStore,
	TokenRecord,
	TokenStore,
	UserPatch,
	UserRecord,
	UserStore,
} from '../../src/auth/port/types';

declare const record: UserRecord;
declare const users: UserStore;
declare const sessions: SessionStore;
declare const tokens: TokenStore;
const now = new Date();

// ── 1. A store missing a method ─────────────────────────────────────────────
// The compiler names the missing method; `assertStores` is the net for
// JavaScript.
// @ts-expect-error updateUser is missing
const partial: UserStore = {
	insertUser: users.insertUser,
	findUser: users.findUser,
	findUserByLogin: users.findUserByLogin,
	listUsers: users.listUsers,
};

// ── 2. An absence answered as undefined ────────────────────────────────────
// Rule 2. `undefined` is what a function that forgot to `return` produces, so
// "not found" by accident is refused here rather than discovered in production.
const undefinedAbsence: UserStore = {
	...users,
	// @ts-expect-error an absence is null, not undefined
	findUser: async () => undefined,
};

// ── 3. A revocation that answers nothing ───────────────────────────────────
// `Promise<void>` would let a store that never checked report success.
const silentRevoke: SessionStore = {
	...sessions,
	// @ts-expect-error revokeSession answers whether the session existed
	revokeSession: async () => {},
};

// ── 4. consumeToken as a boolean ───────────────────────────────────────────
// A boolean cannot say whether THIS call spent the token, which is the whole
// point of answering the token as it was before the call.
const booleanConsume: TokenStore = {
	...tokens,
	// @ts-expect-error consumeToken answers the token before the call, or null
	consumeToken: async () => true,
};

// ── 5. The wrong store in a slot ───────────────────────────────────────────
const swapped: JanusStores = {
	// @ts-expect-error a session store is not a user store
	users: sessions,
	sessions,
	tokens,
};

// ── 6. An update with no expected version ──────────────────────────────────
// `ifVersion` is required on the port: an optional check is the one somebody
// forgets on the one write where it mattered.
// @ts-expect-error ifVersion is required
users.updateUser(record.id, { updatedAt: now });

// ── 7. A redemption that does not say what the token is for ────────────────
// Without `kind`, a verification token redeems as a reset token.
// @ts-expect-error kind is required
tokens.consumeToken('hash', now);

// ── 8. A patch that sets the version ───────────────────────────────────────
const patchVersion: UserPatch = {
	updatedAt: now,
	// @ts-expect-error version is the store's to keep
	version: 3,
};

// ── 9. A patch that changes the id ────────────────────────────────────────
const patchId: UserPatch = {
	updatedAt: now,
	// @ts-expect-error id is not patchable
	id: 'x',
};

// ── 10. A patch that writes undefined over a field ─────────────────────────
// The Kratos `PUT` trap arriving through the type system: without
// `exactOptionalPropertyTypes`, `{ active: undefined }` is a valid patch and a
// naive adapter writes it as an erasure.
// Under that flag the compiler reports it on the declaration, not on the key.
// @ts-expect-error a field is named with a value, or not named at all
const patchUndefined: UserPatch = { updatedAt: now, active: undefined };

// ── 11. A patch with no timestamp ──────────────────────────────────────────
// `updatedAt` comes from the core's clock, so every timestamp on a record comes
// from one clock and a fixed clock in a test controls all of them.
// @ts-expect-error updatedAt is required
const patchUntimed: UserPatch = { active: false };

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

// ── 14. A patch that moves a user to another type ──────────────────────────
// A patient turned staff member by a stray key would keep a patient's fields
// under a staff schema, and sign in to the staff side.
const patchType: UserPatch = {
	updatedAt: now,
	// @ts-expect-error type is not patchable
	type: 'staff',
};

// ── 15. A password left undefined rather than null ─────────────────────────
// Rule 2 on the one field where a missing value would read as "no password"
// rather than as "the store forgot".
const missingPassword: UserRecord = {
	...record,
	// @ts-expect-error password is present, and null when absent
	password: undefined,
};

// ── And the shapes that MUST keep compiling ─────────────────────────────────

// The optional capability may be absent.
const { deleteExpiredSessions: _, ...withoutCollect } = sessions;
const minimalSessions: SessionStore = withoutCollect;

// The reference store is a complete set.
const reference: JanusStores = createMemoryStores();

// A patch may name nothing but the time, and may remove the password.
const timeOnly: UserPatch = { updatedAt: now };
const removePassword: UserPatch = { updatedAt: now, password: null };

// Fields nest, and hold arrays and numbers.
const nestedFields: UserRecord = {
	...record,
	fields: { name: { first: 'Ada' }, tags: ['a', 1, true, null] },
};

// ── 16. countAttempt answering a count ────────────────────────────────────
// A bare number cannot say the token was already spent, nor whose it is: the
// core needs the record as it is after the call.
const numberCount: TokenStore = {
	...tokens,
	// @ts-expect-error countAttempt answers the token after the call, or null
	countAttempt: async () => 1,
};

// ── 17. An attempt counted without saying what the token is for ────────────
// Without `kind`, a guess at a sign-in code counts against a reset link.
// @ts-expect-error kind is required
tokens.countAttempt('hash');

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
declare const token: TokenRecord;
const { attempts: _uncounted, ...withoutAttempts } = token;
// @ts-expect-error a token carries its attempts, 0 when none
const uncountedToken: TokenRecord = withoutAttempts;

// ── 20. A token forwarded without its code hash ────────────────────────────
const { codeHash: _unhashed, ...withoutCodeHash } = token;
// @ts-expect-error a token carries its code hash, null when it has none
const unhashedToken: TokenRecord = withoutCodeHash;

// ── 21. A patch that writes undefined over the second factor ───────────────
// The same trap as 10, on the field whose erasure disables a second factor.
// @ts-expect-error secondFactor is named with a value or null, or not at all
const patchSecondFactor: UserPatch = {
	updatedAt: now,
	secondFactor: undefined,
};

// A class implements the port as well as an object literal does.
class ClassStore implements TokenStore {
	async insertToken(): Promise<void> {}
	async consumeToken(): Promise<null> {
		return null;
	}
	async countAttempt(): Promise<null> {
		return null;
	}
	async deleteUserTokens(): Promise<number> {
		return 0;
	}
}

export const checked = {
	refused: [
		partial,
		undefinedAbsence,
		silentRevoke,
		booleanConsume,
		swapped,
		patchVersion,
		patchId,
		patchUndefined,
		patchUntimed,
		dateField,
		patchType,
		missingPassword,
		numberCount,
		missingSecondFactor,
		uncountedToken,
		unhashedToken,
		patchSecondFactor,
	],
	allowed: [
		minimalSessions,
		reference,
		timeOnly,
		removePassword,
		nestedFields,
		ClassStore,
	],
};
