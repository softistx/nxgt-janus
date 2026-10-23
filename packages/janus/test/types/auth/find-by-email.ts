/**
 * Finding a user by e-mail — `findByEmail`: asked of a type with no e-mail,
 * its answer read without its `null`, and the user handed over instead of
 * the address. Cases 76–78 of the one hundred and two — see `fixtures.ts`. The
 * shapes that must keep compiling are at the end of this file.
 */

import type { FindByEmailApi } from '../../../src/index';
import { clinic, one, twoFactor } from './fixtures';

async function findByEmail(email: string) {
	// ── 76. Asked of a type with no e-mail ────────────────────────────────
	// @ts-expect-error staff have no e-mail: the lookup is absent, not null
	await clinic.staff.findByEmail(email);

	// ── 77. The answer read without its null ──────────────────────────────
	const found = await clinic.guest.findByEmail(email);
	// @ts-expect-error nobody may hold the address: check for null first
	void found.id;

	// ── 78. The user handed over instead of the address ───────────────────
	const user = await one.get('id');
	// @ts-expect-error the address, a string — never the user
	await one.findByEmail(user);
}

// ── Allowed: every type with an e-mail has it, password or not ──────────
async function allowed(email: string) {
	// No password, so no findByLogin: found by e-mail, then signed in on the
	// application's proof.
	const guest = await twoFactor.guest.findByEmail(email);
	const signedIn =
		guest === null ? null : await twoFactor.guest.signInProven(guest);
	const type: 'guest' | undefined = guest?.type;
	const birthDate: string | undefined = (
		await clinic.patient.findByEmail(email)
	)?.birthDate;
	const api: FindByEmailApi<{ readonly id: string }> = one;
	return [signedIn?.token, type, birthDate, api];
}

export const checked = { findByEmail, allowed };
