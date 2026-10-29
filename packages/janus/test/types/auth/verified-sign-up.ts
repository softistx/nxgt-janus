/**
 * Signing up with a verified e-mail — `signUp.prepare` and
 * `password.requireVerifiedEmail`: a prepare on a type whose login is not its
 * e-mail, a verification required where there is no e-mail, a send that is
 * given a session. Cases 108–112 of the one hundred and twelve — see
 * `fixtures.ts`. The shapes that must keep compiling are at the end of this
 * file.
 */

import { z } from 'zod';
import { janus } from '../../../src/index';
import { clinic, hasher, one, Patient, store } from './fixtures';

export async function verifiedSignUp() {
	// ── 108. A prepared sign-up on a type that signs in with a username ───
	// @ts-expect-error a taken username would reveal an account: only a login that is the e-mail has prepare
	await clinic.staff.signUp.prepare({
		username: 'a',
		service: 'x',
		badge: 1,
		password: 'long enough',
	});

	// ── 109. A prepared sign-up on a type with no password ────────────────
	// @ts-expect-error guests have no password to sign up with
	await clinic.guest.signUp.prepare({ email: 'a@b.test', password: 'x' });

	// ── 110. A prepared sign-up on a type whose login is not its e-mail ───
	const byName = janus({
		user: z.object({ email: z.email(), handle: z.string() }),
		password: { login: 'handle' },
		store,
		hasher,
	});
	// @ts-expect-error the login is "handle", not the e-mail: use signUp
	await byName.signUp.prepare({
		email: 'a@b.test',
		handle: 'a',
		password: 'x',
	});

	// ── 111. A verified e-mail required where the schema has none ─────────
	janus({
		user: z.object({ username: z.string() }),
		// @ts-expect-error there is no e-mail to verify: nobody could ever sign in
		password: { login: 'username', requireVerifiedEmail: true },
		store,
		hasher,
	});

	// ── 112. A send that is given a session ───────────────────────────────
	const pending = await one.signUp.prepare({
		email: 'a@b.test',
		name: 'a',
		password: 'long enough',
	});
	// @ts-expect-error send() takes nothing: it opens no session
	await pending.send({ device: 'd' });
}

// ── And the shapes that MUST keep compiling ─────────────────────────────────

export async function allowed() {
	const pending = await clinic.patient.signUp.prepare({
		email: 'a@b.test',
		birthDate: '2000-01-01',
		password: 'long enough',
	});
	const outcome = await pending.send();
	if (outcome.status === 'created') {
		void (outcome.issued.token satisfies string);
		void (outcome.user.email satisfies string);
	} else {
		void (outcome.user.email satisfies string);
	}
	// signUp stays callable, and answers a session.
	const signed = await clinic.patient.signUp({
		email: 'a@b.test',
		birthDate: '2000-01-01',
		password: 'long enough',
	});
	void (signed.token satisfies string);
	const resend = await clinic.patient.verifyEmail.prepare('a@b.test');
	const issued = await resend.send();
	void (issued?.token satisfies string | undefined);
	janus({
		users: {
			patient: {
				schema: Patient,
				password: { login: 'email', requireVerifiedEmail: true },
			},
		},
		store,
		hasher,
	});
}
