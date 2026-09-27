/**
 * What an update patch may say: never the version, the id or the type, never
 * undefined over a field, and always the time. Cases 8–11, 14 and 21 of the
 * twenty-two — see `fixtures.ts`.
 */

import type { UserPatch } from '../../../src/auth/port/types';
import { now } from './fixtures';

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

// ── 14. A patch that moves a user to another type ──────────────────────────
// A patient turned staff member by a stray key would keep a patient's fields
// under a staff schema, and sign in to the staff side.
const patchType: UserPatch = {
	updatedAt: now,
	// @ts-expect-error type is not patchable
	type: 'staff',
};

// ── 21. A patch that writes undefined over the second factor ───────────────
// The same trap as 10, on the field whose erasure disables a second factor.
// @ts-expect-error secondFactor is named with a value or null, or not at all
const patchSecondFactor: UserPatch = {
	updatedAt: now,
	secondFactor: undefined,
};

// ── And the shapes that MUST keep compiling ─────────────────────────────────

// A patch may name nothing but the time, and may remove the password.
const timeOnly: UserPatch = { updatedAt: now };
const removePassword: UserPatch = { updatedAt: now, password: null };

export const checked = {
	refused: [
		patchVersion,
		patchId,
		patchUndefined,
		patchUntimed,
		patchType,
		patchSecondFactor,
	],
	allowed: [timeOnly, removePassword],
};
