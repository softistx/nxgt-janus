/**
 * The shapes that MUST keep compiling, seen from the application: signing up,
 * narrowing by type, the flows each type has, and a second factor read
 * through `status`. No refusal lives here — see `fixtures.ts` for the files
 * that hold them.
 */

import type { User } from '../../../src/index';
import { clinic, one, request, twoFactor } from './fixtures';

async function allowed() {
	const { user, token, session } = await one.signUp({
		email: 'a@b.test',
		name: 'Ada',
		password: 'secret123',
	});
	const name: string = user.name;
	const type: 'user' = user.type;
	const verified: boolean = user.emailVerified;

	await one.verifyEmail.send(user);
	await one.resetPassword.request('a@b.test');
	await one.update(user, { name: 'Ada L.' }, { ifVersion: user.version });

	// Narrowing by `type` reaches the type's own fields.
	const current = await clinic.authenticate(request);
	if (current?.user.type === 'staff') {
		const service: string = current.user.service;
		void service;
	}
	const staff = await clinic.authenticate(request, { type: 'staff' });
	const badge: number | undefined = staff?.user.badge;

	// A patient may reset a password; a guest may still verify an e-mail.
	await clinic.patient.resetPassword.request('a@b.test');
	await clinic.guest.verifyEmail.send('0190e3b4-0000-7000-8000-000000000000');

	// A created user needs no password, and no session is opened.
	const guest: User<'guest', { email: string }> = await clinic.guest.create({
		email: 'g@b.test',
	});

	// With a second factor, `status` says which answer `signIn` gave.
	const result = await twoFactor.patient.signIn({
		email: 'a@b.test',
		password: 'secret123',
	});
	const signedIn =
		result.status === 'signedIn'
			? result
			: await twoFactor.patient.secondFactor.confirm(
					result.challenge,
					'123456',
				);
	const patientToken: string = signedIn.token;
	const enrolment: { secret: string; uri: string } =
		await twoFactor.patient.secondFactor.enroll(signedIn.user);
	const active: boolean = signedIn.user.hasSecondFactor;
	// Without a second factor, a code signs a patient straight in.
	const patientByCode: string = (
		await clinic.patient.signInCode.confirm('challenge', '123456')
	).token;
	// A guest has no password, so no second factor: a code signs them in.
	const guestToken: string = (
		await twoFactor.guest.signInCode.confirm('challenge', '123456')
	).token;

	return [
		name,
		type,
		verified,
		token,
		session,
		badge,
		guest,
		one.cookie.name,
		patientToken,
		enrolment,
		active,
		guestToken,
		patientByCode,
	];
}

export const checked = { allowed };
