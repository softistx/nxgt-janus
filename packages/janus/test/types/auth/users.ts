/**
 * Reading and writing users: a field off the wrong type, the password hash, a
 * type that does not exist, a write that bypasses `update`, `findMany` given
 * one id or read as another type. Cases 16–20, 66 and 67 of the seventy-two —
 * see `fixtures.ts`.
 */

import { clinic, request } from './fixtures';

async function readingAndWriting() {
	const current = await clinic.authenticate(request);
	if (current !== null) {
		// ── 16. Reading one type's field without narrowing ────────────────
		// @ts-expect-error a patient has no service
		current.user.service;

		// ── 17. Reading the password hash ─────────────────────────────────
		// No type that reaches a handler carries it.
		// @ts-expect-error there is no password on a user, only hasPassword
		current.user.password;
	}

	// ── 18. Authenticating as a type that does not exist ──────────────────
	// @ts-expect-error there is no admin type
	await clinic.authenticate(request, { type: 'admin' });

	// ── 19. Changing a field to the wrong type ────────────────────────────
	const { user } = await clinic.staff.signIn({
		username: 'grace',
		password: 'x',
	});
	// @ts-expect-error badge is a number
	await clinic.staff.update(user, { badge: '42' });

	// ── 20. Writing to a user object ──────────────────────────────────────
	// A mutation would not reach the store: `update` is the only write.
	// @ts-expect-error a user is readonly
	user.service = 'surgery';

	// ── 66. findMany given one id ─────────────────────────────────────────
	// One id is `find`; `findMany` takes a list, and answers one.
	// @ts-expect-error findMany takes an array of ids
	await clinic.staff.findMany(user.id);

	// ── 67. Reading another type's field off findMany ─────────────────────
	// `auth.staff.findMany` answers staff users only.
	const [first] = await clinic.staff.findMany([user.id]);
	// @ts-expect-error a staff user has no birthDate
	first?.birthDate;
}

export const checked = { readingAndWriting };
