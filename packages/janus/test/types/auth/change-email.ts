/**
 * Changing an e-mail: a type with no e-mail has no `changeEmail`, and `send`
 * and `confirm` take and answer what they say. Cases 82–84 and 89–91 of the
 * one hundred and seven — see `fixtures.ts`.
 */

import { janus } from '../../../src/index';
import { clinic, one, Staff, store } from './fixtures';

async function changeEmail() {
	// @ts-expect-error staff have no e-mail to move
	await clinic.staff.changeEmail.send('id', 'a@b.test');

	// @ts-expect-error the new address is a string
	await one.changeEmail.send('id', 42);

	const sent = await one.changeEmail.send('id', 'a@b.test');
	const address: string = sent.email;
	void address;

	const user = await one.changeEmail.confirm('token');
	const email: string = user.email;
	void email;

	// @ts-expect-error confirm takes the token alone
	await one.changeEmail.confirm('token', 'a@b.test');
}

async function anyType() {
	// The root of several types confirms for the user's own type: the union of
	// the types with an e-mail, without the staff who have none.
	const user = await clinic.changeEmail.confirm('token');
	const type: 'patient' | 'guest' = user.type;
	void type;
	const email: string = user.email;
	void email;

	// @ts-expect-error the root confirms; sending needs the user's type
	await clinic.changeEmail.send('id', 'a@b.test');

	// @ts-expect-error confirm takes the token alone
	await clinic.changeEmail.confirm('token', 'a@b.test');

	// Nothing at the root when no type has an e-mail.
	const staffOnly = janus({
		users: { staff: { schema: Staff }, porter: { schema: Staff } },
		store,
	});
	// @ts-expect-error no type has an e-mail to move
	await staffOnly.changeEmail.confirm('token');
}

export const checked = { changeEmail, anyType };
