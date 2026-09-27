import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../../test/rejection';
import { NotFoundError, StoreConflict } from '../../../errors/janus-error';
import { mintId } from '../../../ids/id';
import { createMemoryStores } from './stores';
import { at, user } from './stores.fixtures';

// These specs pin the reference store's own behaviour. The conformance suite,
// in `src/conformance/`, is what asks the same questions of every adapter; these
// stay because the store is shipped, and a consumer's tests rely on it.

describe('users', () => {
	it('leaves what a patch does not name exactly as it was', async () => {
		// The Kratos `PUT` trap: an update that omits `state` deactivates the
		// account, one that omits a trait deletes it. Here, omission is "keep".
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);

		const written = await users.updateUser(
			record.id,
			{ updatedAt: at(2), emailVerifiedAt: at(2) },
			0,
		);

		expect(written).toEqual({
			...record,
			emailVerifiedAt: at(2),
			version: 1,
			updatedAt: at(2),
		});
	});

	it('treats a key present as undefined as absent, never as an erasure', async () => {
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);

		// Only JavaScript can send this: the package is compiled with
		// `exactOptionalPropertyTypes`, and `test/types/port/patches.ts` holds the refusal.
		const patch = { updatedAt: at(2), active: undefined, password: undefined };
		const written = await users.updateUser(
			record.id,
			patch as unknown as { updatedAt: Date },
			0,
		);

		expect(written.active).toBe(true);
		expect(written.password).toEqual(record.password);
	});

	it('ignores a key the port does not declare, such as version or type', async () => {
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);

		const written = await users.updateUser(
			record.id,
			{ updatedAt: at(2), version: 99, id: 'x', type: 'staff' } as unknown as {
				updatedAt: Date;
			},
			0,
		);

		expect(written.version).toBe(1);
		expect(written.id).toBe(record.id);
		expect(written.type).toBe('user');
	});

	it('removes the password on null, and keeps it when the patch does not name it', async () => {
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);

		const kept = await users.updateUser(record.id, { updatedAt: at(2) }, 0);
		expect(kept.password).toEqual(record.password);

		const removed = await users.updateUser(
			record.id,
			{ updatedAt: at(3), password: null },
			1,
		);
		expect(removed.password).toBeNull();
	});

	it('refuses a stale version, reports both, and leaves the record identical', async () => {
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);
		await users.updateUser(record.id, { updatedAt: at(2), active: false }, 0);
		const before = await users.findUser(record.id);

		const error = await rejection(
			users.updateUser(record.id, { updatedAt: at(3), active: true }, 0),
		);

		expect(error).toBeInstanceOf(StoreConflict);
		expect((error as StoreConflict).code).toBe('VERSION_CONFLICT');
		expect((error as StoreConflict).expectedVersion).toBe(0);
		expect((error as StoreConflict).actualVersion).toBe(1);
		expect(await users.findUser(record.id)).toEqual(before);
	});

	it('tells an unknown id from a stale version', async () => {
		const { users } = createMemoryStores();

		const error = await rejection(
			users.updateUser(mintId(), { updatedAt: at(2) }, 0),
		);

		expect(error).toBeInstanceOf(NotFoundError);
		expect((error as NotFoundError).code).toBe('NOT_FOUND');
	});

	it('moves a login on update, freeing the old one', async () => {
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);

		await users.updateUser(
			record.id,
			{ updatedAt: at(2), logins: ['new@b.test'] },
			0,
		);

		expect(await users.findUserByLogin('user', 'a@b.test')).toBeNull();
		expect((await users.findUserByLogin('user', 'new@b.test'))?.id).toBe(
			record.id,
		);
		// The freed login is available to somebody else.
		await users.insertUser(user());
	});

	it('refuses an update onto a held login, and writes nothing', async () => {
		const { users } = createMemoryStores();
		const first = user();
		const second = user({ logins: ['b@b.test'] });
		await users.insertUser(first);
		await users.insertUser(second);

		const error = await rejection(
			users.updateUser(
				second.id,
				{ updatedAt: at(2), logins: ['a@b.test'] },
				0,
			),
		);

		expect((error as StoreConflict).code).toBe('LOGIN_TAKEN');
		expect(await users.findUser(second.id)).toEqual(second);
	});
});
