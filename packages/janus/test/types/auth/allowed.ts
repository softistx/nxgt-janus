/**
 * The shapes that MUST keep compiling, seen from the application: signing up,
 * narrowing by type, the flows each type has and `findMany`. The sign-in
 * shapes are in `allowed-sign-in.ts`. No refusal lives here — see
 * `fixtures.ts` for the files that hold them.
 */

import type { User } from '../../../src/index';
import { clinic, one, request } from './fixtures';

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

	// findMany takes a readonly list, and answers the type's own users.
	const ids: readonly string[] = ['0190e3b4-0000-7000-8000-000000000000'];
	const listed = await clinic.staff.findMany(ids);
	const services: string[] = listed.map((member) => member.service);
	const byId = new Map((await one.findMany([...ids])).map((u) => [u.id, u]));

	return [
		name,
		type,
		verified,
		token,
		session,
		badge,
		guest,
		one.cookie.name,
		services,
		byId,
	];
}

export const checked = { allowed };
