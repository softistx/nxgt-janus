/**
 * Signing in on the application's proof — `signInProven`: a session read
 * off a sign-in that may still ask for a factor, a login handed over as the
 * user, and a device given as a bare string. Cases 73–75 of the
 * one hundred and seven — see `fixtures.ts`. The shapes that must keep compiling are
 * at the end of this file.
 */

import type {
	ProvenSignInApi,
	SignedIn,
	SignInResult,
} from '../../../src/index';
import { clinic, one, twoFactor } from './fixtures';

async function provenSignIn(userId: string) {
	// ── 73. A session read off a proven sign-in that may ask for a factor ──
	const proven = await twoFactor.patient.signInProven(userId);
	// @ts-expect-error the application's proof is a first factor: an active one is still asked for
	void proven.token;

	// ── 74. The login handed over as the user ─────────────────────────────
	// @ts-expect-error the user, or their id — never what they sign in with
	await one.signInProven({ email: 'a@b.test' });

	// ── 75. A device given as a bare string ───────────────────────────────
	// @ts-expect-error the device token goes under device: { device }
	await one.signInProven(userId, 'device-token');
}

// ── Allowed: every user type has it, typed as its other sign-ins ─────────
async function allowed(userId: string) {
	// No e-mail and no password: the proof is the application's, so staff
	// and guests have it too.
	const staff = await clinic.staff.signInProven(userId);
	const badge: number = staff.user.badge;
	// No password, so no factor: a session, whatever the instance.
	const guest: SignedIn<{ readonly email: string }> =
		await twoFactor.guest.signInProven(userId);
	const result: SignInResult<{ readonly birthDate: string }> =
		await twoFactor.patient.signInProven({ id: userId }, { device: null });
	const token: string | undefined =
		result.status === 'signedIn' ? result.token : undefined;
	const api: ProvenSignInApi<{ readonly id: string }> = one;
	return [badge, guest.token, token, api];
}

export const checked = { provenSignIn, allowed };
