import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../test/rejection';
import { countingWrites, invitations } from './find-or-create.fixtures';

const grace = { email: 'grace@example.test', name: 'Grace Hopper' };
const hopper = { username: 'Hopper', email: 'hopper@example.test' };

describe('findOrCreate, on a user that exists', () => {
	it('finds by the login, normalised as findByLogin normalises it', async () => {
		const { auth, received } = invitations();
		const patient = await auth.patient.create({
			...grace,
			password: 'correct horse',
		});
		received.length = 0;
		let called = 0;

		const answer = await auth.patient.findOrCreate(
			'  GRACE@Example.test ',
			() => {
				called += 1;
				return grace;
			},
		);

		expect(answer.created).toBe(false);
		expect(answer.user.id).toBe(patient.id);
		expect(called).toBe(0);
		expect(received).toEqual([]);
	});

	it('finds by the username on a type whose login is not its e-mail', async () => {
		const { auth } = invitations();
		const staff = await auth.staff.create(hopper);

		const answer = await auth.staff.findOrCreate('Hopper', () => hopper);

		expect(answer).toEqual({ user: staff, created: false });
		// As findByLogin does, a login also finds the user by their e-mail.
		const byEmail = await auth.staff.findOrCreate(hopper.email, () => hopper);
		expect(byEmail).toEqual({ user: staff, created: false });
	});

	it('finds by the e-mail on a type with no password', async () => {
		const { auth } = invitations();
		const member = await auth.member.create(grace);

		const answer = await auth.member.findOrCreate(' Grace@EXAMPLE.test', () => {
			throw new Error('input must not be called');
		});

		expect(answer).toEqual({ user: member, created: false });
	});

	it('answers an inactive user too, and writes nothing', async () => {
		const { store, writes } = countingWrites();
		const { auth } = invitations({ store });
		const member = await auth.member.create({ ...grace, active: false });
		const before = writes.count;

		const answer = await auth.member.findOrCreate(grace.email, () => grace);

		expect(answer.created).toBe(false);
		expect(answer.user.id).toBe(member.id);
		expect(answer.user.active).toBe(false);
		expect(writes.count).toBe(before);
	});
});

describe('findOrCreate, on nobody', () => {
	it('creates the user as create does, and sends user.created', async () => {
		const { auth, received } = invitations();

		const answer = await auth.patient.findOrCreate(grace.email, async () => ({
			...grace,
			password: 'correct horse',
		}));

		expect(answer.created).toBe(true);
		expect(answer.user.email).toBe(grace.email);
		expect(await auth.patient.findByLogin(grace.email)).toEqual(answer.user);
		expect(received.map((event) => event.type)).toEqual(['user.created']);
		// The password was hashed: the user can sign in with it.
		const signedIn = await auth.patient.signIn({
			email: grace.email,
			password: 'correct horse',
		});
		expect(signedIn.user.id).toBe(answer.user.id);
	});

	it('creates on a type with no password, by the e-mail', async () => {
		const { auth } = invitations();

		const answer = await auth.member.findOrCreate('GRACE@example.test', () => ({
			...grace,
			email: 'Grace@Example.test',
			active: false,
		}));

		expect(answer.created).toBe(true);
		expect(answer.user.active).toBe(false);
		expect((await auth.member.findByEmail(grace.email))?.id).toBe(
			answer.user.id,
		);
	});

	it('propagates what input throws, and writes nothing', async () => {
		const { store, writes } = countingWrites();
		const { auth, received } = invitations({ store });
		const refusal = new Error('a password is required');

		const error = await rejection(
			auth.patient.findOrCreate(grace.email, () => {
				throw refusal;
			}),
		);
		const rejected = await rejection(
			auth.patient.findOrCreate(grace.email, async () => {
				throw refusal;
			}),
		);

		expect(error).toBe(refusal);
		expect(rejected).toBe(refusal);
		expect(writes.count).toBe(0);
		expect(received).toEqual([]);
		expect(await auth.patient.findByLogin(grace.email)).toBeNull();
	});

	it('refuses an input that names another key with USER_INVALID, writing nothing', async () => {
		const { store, writes } = countingWrites();
		const { auth, received } = invitations({ store });

		for (const [type, key] of [
			[auth.patient, 'other@example.test'],
			[auth.member, 'other@example.test'],
		] as const) {
			const error = await rejection(type.findOrCreate(key, () => grace));
			expect(error).toMatchObject({
				code: 'USER_INVALID',
				userType: type === auth.patient ? 'patient' : 'member',
			});
			expect((error as Error).message).not.toContain(grace.email);
		}
		const staff = await rejection(
			auth.staff.findOrCreate('Admiral', () => hopper),
		);
		expect(staff).toMatchObject({ code: 'USER_INVALID' });

		expect(writes.count).toBe(0);
		expect(received).toEqual([]);
	});

	it('refuses an e-mail key nobody holds on a username type: the username is not the key', async () => {
		const { store, writes } = countingWrites();
		const { auth } = invitations({ store });

		const error = await rejection(
			auth.staff.findOrCreate(hopper.email, () => hopper),
		);

		expect(error).toMatchObject({ code: 'USER_INVALID', userType: 'staff' });
		expect(writes.count).toBe(0);
	});

	it('refuses a key that is no storable string, through the creation', async () => {
		const { store, writes } = countingWrites();
		const { auth } = invitations({ store });

		for (const key of ['', '  ', 'grace\u0000@example.test', undefined, 42]) {
			const error = await rejection(
				auth.member.findOrCreate(key as string, () => grace),
			);
			expect(error).toMatchObject({ code: 'USER_INVALID' });
		}
		expect(writes.count).toBe(0);
	});

	it('refuses a short password with PASSWORD_TOO_SHORT, writing nothing', async () => {
		const { store, writes } = countingWrites();
		const { auth } = invitations({ store });

		const error = await rejection(
			auth.patient.findOrCreate(grace.email, () => ({
				...grace,
				password: 'short',
			})),
		);

		expect(error).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
		expect(writes.count).toBe(0);
	});
});
