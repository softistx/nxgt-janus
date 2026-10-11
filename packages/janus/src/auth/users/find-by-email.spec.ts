import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../test/rejection';
import { StoreFailure } from '../../errors/janus-error';
import { recording } from '../mail-requests.fixtures';
import { createMemoryStores } from '../port/memory';
import { lookup } from './find-by-email.fixtures';

const grace = { email: 'grace@example.test', name: 'Grace Hopper' };

describe('findByEmail', () => {
	it('finds the user of a type with no password by the address', async () => {
		const { auth } = lookup();
		const member = await auth.member.create(grace);

		const found = await auth.member.findByEmail(grace.email);

		expect(found?.id).toBe(member.id);
		expect(found?.type).toBe('member');
		expect(found?.email).toBe(grace.email);
	});

	it('answers null for an address nobody of this type holds', async () => {
		const { auth } = lookup();
		await auth.member.create(grace);

		expect(await auth.member.findByEmail('nobody@example.test')).toBeNull();
	});

	it("answers null for another type's user: the same address is two users", async () => {
		const { auth } = lookup();
		const patient = await auth.patient.create(grace);

		expect(await auth.member.findByEmail(grace.email)).toBeNull();
		expect((await auth.patient.findByEmail(grace.email))?.id).toBe(patient.id);

		const member = await auth.member.create(grace);
		expect((await auth.member.findByEmail(grace.email))?.id).toBe(member.id);
		expect((await auth.patient.findByEmail(grace.email))?.id).toBe(patient.id);
	});

	it('normalises the address as the e-mail flows do: trimmed and lowercased', async () => {
		const { auth } = lookup();
		const member = await auth.member.create({
			...grace,
			email: 'Grace@Example.test',
		});

		for (const asked of [
			'grace@example.test',
			'  GRACE@EXAMPLE.TEST ',
			'\tGrace@Example.test\n',
		]) {
			expect((await auth.member.findByEmail(asked))?.id).toBe(member.id);
		}
	});

	it('finds by the e-mail on a type that signs in with a username, never by the username', async () => {
		const { auth } = lookup();
		const staff = await auth.staff.create({
			username: 'grace@example.test',
			email: 'hopper@example.test',
		});
		const other = await auth.staff.create({
			username: 'Admiral',
			email: 'admiral@example.test',
		});

		expect((await auth.staff.findByEmail(' HOPPER@example.test'))?.id).toBe(
			staff.id,
		);
		// A username that only looks like an address is nobody's e-mail.
		expect(await auth.staff.findByEmail('grace@example.test')).toBeNull();
		expect(await auth.staff.findByEmail('admiral')).toBeNull();
		expect((await auth.staff.findByLogin('Admiral'))?.id).toBe(other.id);
	});

	it('follows a changed address: the old one is nobody', async () => {
		const { auth } = lookup();
		const member = await auth.member.create(grace);
		await auth.member.update(member, { email: 'hopper@example.test' });

		expect(await auth.member.findByEmail(grace.email)).toBeNull();
		expect((await auth.member.findByEmail('hopper@example.test'))?.id).toBe(
			member.id,
		);
	});

	it('answers an inactive user too, as find does', async () => {
		const { auth } = lookup();
		const member = await auth.member.create({ ...grace, active: false });

		const found = await auth.member.findByEmail(grace.email);

		expect(found?.id).toBe(member.id);
		expect(found?.active).toBe(false);
	});
});

describe('findByEmail, on a value that is no address', () => {
	const malformed: unknown[] = [
		'',
		'   ',
		'grace\u0000@example.test',
		'grace\uD800@example.test',
		undefined,
		null,
		42,
		{ email: 'grace@example.test' },
	];

	it('answers null, as find answers a malformed id, without asking the store', async () => {
		const { store, calls } = recording();
		const { auth } = lookup({ store });
		await auth.member.create(grace);
		calls.length = 0;

		for (const value of malformed) {
			expect(await auth.member.findByEmail(value as string)).toBeNull();
		}
		expect(calls).toEqual([]);
	});
});

describe('findByEmail, on a store that fails', () => {
	it('rejects with STORE_FAILED, never null', async () => {
		const memory = createMemoryStores();
		const driver = new Error('connect ECONNREFUSED');
		const store = {
			...memory,
			users: {
				...memory.users,
				findUserByLogin: async () => {
					throw driver;
				},
			},
		};
		const { auth } = lookup({ store });

		const error = await rejection(auth.member.findByEmail(grace.email));

		expect(error).toBeInstanceOf(StoreFailure);
		expect(error).toMatchObject({
			code: 'STORE_FAILED',
			slot: 'users',
			operation: 'findUserByLogin',
		});
		expect((error as StoreFailure).cause).toBe(driver);
	});
});

describe('findByEmail, beside the stores', () => {
	it('reads one login and writes nothing: no token, no session, no user', async () => {
		const { store, calls } = recording();
		const { auth } = lookup({ store });
		await auth.member.create(grace);
		calls.length = 0;

		await auth.member.findByEmail(grace.email);
		await auth.member.findByEmail('nobody@example.test');

		expect(calls).toEqual(['users.findUserByLogin', 'users.findUserByLogin']);
	});
});
