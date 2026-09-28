/**
 * Signing up and in with the wrong login, without a password, or on a type
 * that has none. Cases 10–15 of the thirty-seven — see `fixtures.ts`.
 */

import { clinic, one } from './fixtures';

async function signingUpAndIn() {
	// ── 10. Signing in with another type's login field ──────────────────────
	// @ts-expect-error staff sign in with a username
	await clinic.staff.signIn({ email: 'a@b.test', password: 'x' });

	// ── 11. Signing in without a password ─────────────────────────────────
	// @ts-expect-error password is required
	await one.signIn({ email: 'a@b.test' });

	// ── 12. Signing up without a password ─────────────────────────────────
	// `create` is the call for a user with none; `signUp` signs in.
	// @ts-expect-error password is required
	await one.signUp({ email: 'a@b.test', name: 'Ada' });

	// ── 13. Signing up without a required field ───────────────────────────
	// @ts-expect-error birthDate is required
	await clinic.patient.signUp({ email: 'a@b.test', password: 'secret123' });

	// ── 14. A flow the type does not have ─────────────────────────────────
	// Staff have no e-mail: there is nowhere to send a reset link.
	// @ts-expect-error staff have no resetPassword
	await clinic.staff.resetPassword.request('a@b.test');

	// ── 15. Signing in to a type with no password ─────────────────────────
	// @ts-expect-error guests do not sign in with a password
	await clinic.guest.signIn({ email: 'a@b.test', password: 'x' });
}

export const checked = { signingUpAndIn };
