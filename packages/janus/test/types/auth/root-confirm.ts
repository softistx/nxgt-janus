/**
 * Confirming a verification or a reset link at the root of several types: the
 * root exists only where a type can answer it, `confirm` takes what it says,
 * and answers the types that can. Cases 95–102 of the one hundred and seven —
 * see `fixtures.ts`.
 */

import { z } from 'zod';
import { janus } from '../../../src/index';
import { clinic, one, Staff, store } from './fixtures';

async function verifyEmail() {
	// The root confirms for the user's own type: the union of the types with an
	// e-mail, without the staff who have none.
	const user = await clinic.verifyEmail.confirm('token');
	const type: 'patient' | 'guest' = user.type;
	void type;
	const email: string = user.email;
	void email;

	// @ts-expect-error the root confirms; sending needs the user's type
	await clinic.verifyEmail.send('id');

	// @ts-expect-error confirm takes a token and an options object, not an e-mail
	await clinic.verifyEmail.confirm('token', 'a@b.test');

	// The first-proof option compiles on the root and on a type.
	await clinic.verifyEmail.confirm('token', { firstProof: true });
	await one.verifyEmail.confirm('token', { firstProof: true });

	// @ts-expect-error a misspelled option would be a silent no-op
	await clinic.verifyEmail.confirm('token', { firstproof: true });

	// @ts-expect-error firstProof is a boolean
	await clinic.verifyEmail.confirm('token', { firstProof: 'yes' });

	// @ts-expect-error the options are an object, not a flag
	await one.verifyEmail.confirm('token', true);

	// @ts-expect-error a misspelled option on a type
	await one.verifyEmail.confirm('token', { firstproof: true });

	// Nothing at the root when no type has an e-mail.
	const staffOnly = janus({
		users: { staff: { schema: Staff }, porter: { schema: Staff } },
		store,
	});
	// @ts-expect-error no type has an e-mail to verify
	await staffOnly.verifyEmail.confirm('token');

	// @ts-expect-error staff are not answered: they have no e-mail
	const staff: 'staff' = user.type;
	void staff;
}

async function resetPassword() {
	// The users of the types with a login and an e-mail: patients here, not
	// the guests who have no password, nor the staff who have no e-mail.
	const user = await clinic.resetPassword.confirm('token', 'a long password');
	const type: 'patient' = user.type;
	void type;

	// @ts-expect-error the root confirms; asking for a link needs the user's type
	await clinic.resetPassword.request('a@b.test');

	// @ts-expect-error confirm takes the token and the password
	await clinic.resetPassword.confirm('token');

	// @ts-expect-error confirm takes no device or third argument
	await clinic.resetPassword.confirm('token', 'a long password', 'x');

	// Nothing at the root when no type has both a password and an e-mail.
	const noneBoth = janus({
		users: {
			staff: { schema: Staff, password: { login: 'username' } },
			guest: { schema: z.object({ email: z.email() }) },
		},
		store,
	});
	// @ts-expect-error no type can reset a password: staff have no e-mail, guests no password
	await noneBoth.resetPassword.confirm('token', 'a long password');
}

async function singleType() {
	// One type keeps its flows at the root, as before.
	await one.verifyEmail.confirm('token');
	await one.resetPassword.confirm('token', 'a long password');
}

export const checked = { verifyEmail, resetPassword, singleType };
