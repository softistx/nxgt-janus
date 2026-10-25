/**
 * Proving an e-mail on the application's proof — `verifyEmail.proveFirst`:
 * asked of a type with no e-mail, its answer read as a sign-in, and its
 * answer read as the user. Cases 79–81 of the one hundred and six — see
 * `fixtures.ts`. The shapes that must keep compiling are at the end of this
 * file.
 */

import type { FirstProof, User } from '../../../src/index';
import { clinic, one, twoFactor } from './fixtures';

async function proveFirst(userId: string) {
	// ── 79. Asked of a type with no e-mail ────────────────────────────────
	// @ts-expect-error staff have no e-mail: there is nothing to prove, so the call is absent
	await clinic.staff.verifyEmail.proveFirst(userId);

	// ── 80. Its answer read as a sign-in ──────────────────────────────────
	const first = await one.verifyEmail.proveFirst(userId);
	// @ts-expect-error proveFirst opens no session — it revokes them: call signInProven after it
	void first.token;

	// ── 81. Its answer read as the user ───────────────────────────────────
	// @ts-expect-error the user is first.user; first itself is { user, proved }
	void first.emailVerified;
}

// ── Allowed: the invitation recipe, in its order ────────────────────────
async function allowed(email: string, password: string) {
	const member =
		(await clinic.patient.findByEmail(email)) ??
		(await clinic.patient.create({ email, birthDate: '1815-12-10' }));
	const first = await clinic.patient.verifyEmail.proveFirst(member);
	await clinic.patient.setPassword(first.user, password);
	const signedIn = await clinic.patient.signInProven(first.user);
	// A type with no password has it too, and its answer is the type's user.
	const guest = await twoFactor.guest.create({ email });
	const proved: boolean = (await twoFactor.guest.verifyEmail.proveFirst(guest))
		.proved;
	const birthDate: string = first.user.birthDate;
	const typed: FirstProof<User<'patient'>> = first;
	return [signedIn.token, proved, birthDate, typed];
}

export const checked = { proveFirst, allowed };
