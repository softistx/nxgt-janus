import { describe, expect, it } from 'bun:test';
import { ada, clinic, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import type {
	CredentialError,
	JanusError,
	StoreConflict,
} from '../../errors/janus-error';

describe('reading', () => {
	it('answers null for an absence, and a malformed id never reaches the store', async () => {
		const { auth } = setup();

		expect(await auth.find('018f0000-0000-7000-8000-000000000000')).toBeNull();
		expect(await auth.find('../../etc/passwd')).toBeNull();
		expect(await auth.findUser('not-an-id')).toBeNull();
		expect(await auth.findByLogin('nobody@example.test')).toBeNull();
	});

	it('turns an absence into NOT_FOUND only on get', async () => {
		const { auth } = setup();

		const error = (await rejection(
			auth.get('018f0000-0000-7000-8000-000000000000'),
		)) as JanusError;

		expect(error.code).toBe('NOT_FOUND');
	});

	it('pages in creation order, and refuses a cursor it did not mint', async () => {
		const { auth, clock } = setup();
		const ids: string[] = [];
		for (const n of [1, 2, 3]) {
			ids.push(
				(await auth.create({ email: `u${n}@example.test`, name: `U${n}` })).id,
			);
			clock.advance(1);
		}

		const first = await auth.list({ limit: 2 });
		const second = await auth.list({ after: first.nextCursor, limit: 2 });

		expect(first.items.map((u) => u.id)).toEqual(ids.slice(0, 2));
		expect(second.items.map((u) => u.id)).toEqual(ids.slice(2));
		expect(second.nextCursor).toBeNull();
		expect(
			((await rejection(auth.list({ after: 'page-2' }))) as JanusError).code,
		).toBe('INVALID_CURSOR');
	});
});

describe('writing', () => {
	it('merges a patch over the stored fields, and validates the result whole', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, nickname: 'Ada', password });

		const updated = await auth.update(user, { name: 'Ada King' });

		expect(updated).toMatchObject({
			email: ada.email,
			name: 'Ada King',
			nickname: 'Ada',
			version: 1,
		});
		expect(
			((await rejection(auth.update(user, { email: 'nope' }))) as JanusError)
				.code,
		).toBe('USER_INVALID');
	});

	it('refuses a field janus sets, from a schema that passes unknown keys through', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		// The strict schema refuses the key first; either way, nothing is written.
		const error = (await rejection(
			auth.update(user, { active: false } as never),
		)) as JanusError;

		expect(error.code).toBe('USER_INVALID');
		expect((await auth.get(user.id)).active).toBe(true);
	});

	it('moves the login with the e-mail, and un-verifies a new e-mail', async () => {
		const { auth, store } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const record = await store.users.findUser(user.id);
		await store.users.updateUser(
			user.id,
			{ updatedAt: new Date(), emailVerifiedAt: new Date() },
			record?.version ?? 0,
		);

		const renamed = await auth.update(user, { name: 'Ada King' });
		const moved = await auth.update(user, { email: 'countess@example.test' });

		expect(renamed.emailVerified).toBe(true);
		expect(moved.emailVerified).toBe(false);
		expect(await auth.findByLogin(ada.email)).toBeNull();
		expect((await auth.findByLogin('countess@example.test'))?.id).toBe(user.id);
	});

	it('refuses a stale ifVersion, and writes nothing', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		await auth.update(user, { name: 'Ada King' });

		const error = (await rejection(
			auth.update(user, { name: 'Lost update' }, { ifVersion: user.version }),
		)) as StoreConflict;

		expect(error.code).toBe('VERSION_CONFLICT');
		expect(error.expectedVersion).toBe(0);
		expect(error.actualVersion).toBe(1);
		expect((await auth.get(user.id)).name).toBe('Ada King');
	});

	it('refuses a write to an unknown or malformed id with NOT_FOUND', async () => {
		const { auth } = setup();

		for (const id of ['018f0000-0000-7000-8000-000000000000', 'nope']) {
			const error = (await rejection(auth.setActive(id, false))) as JanusError;
			expect(error.code).toBe('NOT_FOUND');
		}
	});

	it('sets and changes the password, checking the current one', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const wrong = (await rejection(
			auth.changePassword(user, {
				current: 'wrong password',
				next: 'new password',
			}),
		)) as CredentialError;
		await auth.changePassword(user, {
			current: password,
			next: 'new password',
		});

		expect(wrong.code).toBe('CREDENTIALS_INVALID');
		expect(wrong.reason).toBe('wrongPassword');
		await auth.signIn({ email: ada.email, password: 'new password' });

		const bare = await auth.create({
			email: 'bare@example.test',
			name: 'Bare',
		});
		expect(bare.hasPassword).toBe(false);
		expect((await auth.setPassword(bare, 'first password')).hasPassword).toBe(
			true,
		);
	});
});

describe('several user types', () => {
	it('keeps each type to itself: login unique per type, and find by type', async () => {
		const { auth } = clinic();
		const patient = await auth.patient.signUp({
			email: 'grace@example.test',
			birthDate: '1906-12-09',
			password,
		});
		// The same person, as staff, is another user.
		const staff = await auth.staff.signUp({
			username: 'grace@example.test',
			service: 'navy',
			password,
		});

		expect(patient.user.type).toBe('patient');
		expect(staff.user.type).toBe('staff');
		expect(await auth.staff.find(patient.user.id)).toBeNull();
		expect((await auth.findUser(patient.user.id))?.type).toBe('patient');
		expect((await auth.patient.list()).items.map((u) => u.id)).toEqual([
			patient.user.id,
		]);
	});

	it('normalises each type by its own rule', async () => {
		const { auth } = clinic();
		await auth.staff.signUp({ username: 'Grace', service: 'navy', password });

		// `normalize: 'none'` for staff usernames: case matters.
		expect(await auth.staff.findByLogin('grace')).toBeNull();
		expect(await auth.staff.findByLogin('Grace')).not.toBeNull();
	});

	it('names the type in the operation of a refusal', async () => {
		const { auth } = clinic();

		const error = (await rejection(
			auth.staff.signIn({ username: 'nobody', password }),
		)) as CredentialError;

		expect(error.message).toStartWith('staff.signIn:');
		expect(error.userType).toBe('staff');
	});
});
