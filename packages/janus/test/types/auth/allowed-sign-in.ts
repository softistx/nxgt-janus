/**
 * The sign-in shapes that MUST keep compiling, seen from the application: a
 * second factor read through `status`, and the codes and links that sign a
 * user in. No refusal lives here — see `fixtures.ts`; the rest of the shapes
 * that must compile are in `allowed.ts`.
 */

import { clinic, twoFactor } from './fixtures';

async function allowedSignIn() {
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
	// And so does a link — a patient's, once narrowed on `status`.
	const guestByLink: string = (await twoFactor.guest.magicLink.confirm('token'))
		.token;
	const linked = await twoFactor.patient.magicLink.confirm('token');
	const patientByLink: string | null =
		linked.status === 'signedIn' ? linked.token : null;
	const link = await clinic.patient.magicLink.request('a@b.test');
	const sent: string | undefined = link?.token;

	return [
		patientToken,
		enrolment,
		active,
		guestToken,
		patientByCode,
		guestByLink,
		patientByLink,
		sent,
	];
}

export const checked = { allowedSignIn };
