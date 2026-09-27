import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../../test/auth';
import { StoreConflict } from '../../../errors/janus-error';
import { mintId } from '../../../ids/id';
import { createMemoryStores } from './stores';
import { user } from './stores.fixtures';

// These specs pin the reference store's own behaviour. The conformance suite,
// in `src/conformance/`, is what asks the same questions of every adapter; these
// stay because the store is shipped, and a consumer's tests rely on it.

describe('users', () => {
	it('round-trips a record byte for byte, a number staying a number', async () => {
		const { users } = createMemoryStores();
		const record = user({ fields: { email: 'a@b.test', age: 1 } });

		await users.insertUser(record);

		expect(await users.findUser(record.id)).toEqual(record);
		expect((await users.findUserByLogin('user', 'a@b.test'))?.fields.age).toBe(
			1,
		);
	});

	it('answers null for an absence, never undefined', async () => {
		const { users } = createMemoryStores();

		expect(await users.findUser(mintId())).toBeNull();
		expect(await users.findUserByLogin('user', 'nobody@b.test')).toBeNull();
	});

	it('copies in and out, so a caller mutating a record cannot reach the store', async () => {
		const { users } = createMemoryStores();
		const record = user();
		const inserted = await users.insertUser(record);

		(record.fields as Record<string, unknown>).email = 'mutated-before';
		(inserted.fields as Record<string, unknown>).email = 'mutated-after';

		expect((await users.findUser(record.id))?.fields.email).toBe('a@b.test');
	});

	it('compares logins as bytes, and within one type', async () => {
		// Normalisation is the core's, before the store sees a value.
		const { users } = createMemoryStores();
		await users.insertUser(user());

		expect(await users.findUserByLogin('user', 'A@B.test')).toBeNull();
		expect(await users.findUserByLogin('staff', 'a@b.test')).toBeNull();
	});

	it('is idempotent under retry: the same id answers the stored record', async () => {
		const { users } = createMemoryStores();
		const record = user();

		await users.insertUser(record);
		const retried = await users.insertUser({
			...record,
			fields: { email: 'different@b.test' },
		});

		expect(retried).toEqual(record);
	});

	it('refuses a login another user of the type holds, and writes nothing', async () => {
		const { users } = createMemoryStores();
		await users.insertUser(user());
		const second = user();

		const error = await rejection(users.insertUser(second));

		expect(error).toBeInstanceOf(StoreConflict);
		expect((error as StoreConflict).code).toBe('LOGIN_TAKEN');
		expect((error as StoreConflict).login).toBe('a@b.test');
		expect(await users.findUser(second.id)).toBeNull();
	});

	it('lets the same login be held once per type', async () => {
		const { users } = createMemoryStores();
		await users.insertUser(user());
		const staff = user({ type: 'staff' });

		await users.insertUser(staff);

		expect((await users.findUserByLogin('staff', 'a@b.test'))?.id).toBe(
			staff.id,
		);
	});

	it('lets exactly one of twenty concurrent sign-ups hold a login', async () => {
		const { users } = createMemoryStores();

		const outcomes = await Promise.allSettled(
			Array.from({ length: 20 }, () => users.insertUser(user())),
		);

		expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
		expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(19);
	});

	it('pages one type in id order with no gap, and ends on a null cursor', async () => {
		const { users } = createMemoryStores();
		const ids: string[] = [];
		for (let i = 0; i < 25; i += 1) ids.push(mintId());
		// Inserted out of order, so the Map's insertion order is not the answer.
		for (const id of [...ids].reverse()) {
			await users.insertUser(user({ id, logins: [id] }));
		}
		await users.insertUser(user({ type: 'staff', logins: ['staff'] }));

		const seen: string[] = [];
		let after: string | null = null;
		let pages = 0;
		do {
			const page = await users.listUsers({ type: 'user', after, limit: 10 });
			seen.push(...page.items.map((item) => item.id));
			after = page.nextCursor;
			pages += 1;
		} while (after !== null);

		expect(pages).toBe(3);
		expect(seen).toEqual([...ids].sort());
	});

	it('answers an empty page for an empty store, never null', async () => {
		const { users } = createMemoryStores();

		expect(
			await users.listUsers({ type: 'user', after: null, limit: 10 }),
		).toEqual({ items: [], nextCursor: null });
	});
});
