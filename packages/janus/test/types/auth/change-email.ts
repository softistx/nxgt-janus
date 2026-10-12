/**
 * Changing an e-mail: a type with no e-mail has no `changeEmail`, and `send`
 * and `confirm` take and answer what they say. Cases 82–84 of the
 * eighty-four — see `fixtures.ts`.
 */

import { clinic, one } from './fixtures';

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

export const checked = { changeEmail };
