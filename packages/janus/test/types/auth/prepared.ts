/**
 * Requests in two steps — `prepare`, then `send()`: a type with no e-mail or
 * no password, an answer read without its `null`, a challenge read off a
 * link, and a count a caller tries to pass. Cases 68–72 of the seventy-two —
 * see `fixtures.ts`. The shapes that must keep compiling are at the end of
 * this file.
 */

import type { PreparedCode, PreparedRequest } from '../../../src/index';
import { clinic, one } from './fixtures';

async function prepared() {
	// ── 68. A prepared request for a type with no e-mail ──────────────────
	// @ts-expect-error staff have no e-mail to send a link to
	await clinic.staff.magicLink.prepare('a@b.test');

	// ── 69. A reset prepared for a type with no password ──────────────────
	// @ts-expect-error guests have no password to reset
	await clinic.guest.resetPassword.prepare('a@b.test');

	// ── 70. What send() answers, read without its null ────────────────────
	const pending = await one.magicLink.prepare('a@b.test');
	const issued = await pending.send();
	// @ts-expect-error null when nobody holds the e-mail: send nothing then
	void issued.token;

	// ── 71. A challenge read off a prepared link ──────────────────────────
	// Only a sign-in code's prepared request carries one.
	// @ts-expect-error a link has no challenge: the token is in what send() answers
	void pending.challenge;

	// ── 72. Telling send() the request was counted already ────────────────
	// The count is prepare's, made once; nothing a caller passes skips it.
	// @ts-expect-error send() takes nothing
	await pending.send({ counted: true });
}

// ── Allowed: the challenge now, the code later, each typed per flow ──────
async function allowed() {
	const code: PreparedCode<{ readonly email: string }> =
		await clinic.patient.signInCode.prepare('a@b.test');
	const challenge: string = code.challenge;
	const sent = await code.send();
	const typed: string | undefined = sent?.code;

	const link: PreparedRequest<{ readonly token: string }> =
		await clinic.patient.magicLink.prepare('a@b.test');
	const reset = await clinic.patient.resetPassword.prepare('a@b.test');
	const birthDate: string | undefined = (await reset.send())?.user.birthDate;
	const guestCode = await clinic.guest.signInCode.prepare('a@b.test');
	return [challenge, typed, link, birthDate, guestCode.challenge];
}

export const checked = { prepared, allowed };
