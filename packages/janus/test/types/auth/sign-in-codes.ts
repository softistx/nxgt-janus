/**
 * Sign-in codes: a type with no e-mail, a session read off a code that may
 * still ask for a factor, a code read off a request that found nobody. Cases
 * 29–31 of the thirty-seven — see `fixtures.ts`.
 */

import { clinic, one, twoFactor } from './fixtures';

async function signInCodes() {
	// ── 29. A sign-in code for a type with no e-mail ──────────────────────
	// @ts-expect-error staff have no e-mail to send a code to
	await clinic.staff.signInCode.request('a@b.test');

	// ── 30. A session read off a code that may still ask for a factor ─────
	const coded = await twoFactor.patient.signInCode.confirm(
		'challenge',
		'123456',
	);
	// @ts-expect-error the code proves the e-mail; an active factor is still asked for
	void coded.token;

	// ── 31. A code read off a request that may have found nobody ──────────
	const issued = await one.signInCode.request('a@b.test');
	// @ts-expect-error null when nobody holds the e-mail: send nothing then
	void issued.code;
}

export const checked = { signInCodes };
