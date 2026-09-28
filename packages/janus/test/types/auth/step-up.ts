/**
 * Step-ups: a type with no e-mail, a code read off a step-up the app may
 * confirm, a confirmation with no session to stamp, and a `maxAge` that is
 * no duration. Cases 39–42 of the forty-four — see `fixtures.ts`. The shapes
 * that must keep compiling are at the end.
 */

import { assertFresh } from '../../../src/index';
import { clinic, one, request, twoFactor } from './fixtures';

const id = '0192b3a4-0000-7000-8000-000000000001';

async function stepUps() {
	// ── 39. A step-up for a type with no e-mail ───────────────────────────
	// @ts-expect-error staff have no e-mail to send a code to
	await clinic.staff.stepUp.request(id);

	// ── 40. A code read off a step-up the app may confirm ─────────────────
	const issued = await twoFactor.patient.stepUp.request(id);
	// @ts-expect-error a user whose factor is active is sent no code: narrow on `via`
	void issued.code;

	// ── 41. A confirmation with no session to stamp ───────────────────────
	// @ts-expect-error confirm stamps the session the request presents: pass the request first
	await one.stepUp.confirm('challenge', '123456');

	// ── 42. A maxAge that is no duration ──────────────────────────────────
	const current = await one.authenticate(request);
	if (current !== null) {
		// @ts-expect-error a duration is a number and a unit: '10m', not '10 minutes'
		assertFresh(current.session, '10 minutes');
	}
}

/** What must keep compiling: no refusal lives below. */
async function allowedStepUps() {
	// Without a second factor, every step-up is by e-mail: the code is there.
	const byEmail = await one.stepUp.request(id);
	const code: string = byEmail.code;
	const email: string = byEmail.email;

	// With one, `via` says which: narrowed, the code is there again.
	const either = await twoFactor.patient.stepUp.request(id);
	if (either.via === 'email') {
		const sent: string = either.code;
		void sent;
	}

	// A guest has an e-mail and no password: a step-up, and no second factor.
	const guest = await twoFactor.guest.stepUp.request(id);
	const guestCode: string = guest.code;

	const session = await one.stepUp.confirm(request, byEmail.challenge, code);
	const at: Date = session.authenticatedAt;
	assertFresh(session, '10m');
	assertFresh(session, 600_000);
	void [email, guestCode, at];
}

export const checked = { stepUps, allowedStepUps };
