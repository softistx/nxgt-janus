import { describe, expect, it } from 'bun:test';
import { clinic, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import type { JanusError } from '../../errors/janus-error';
import { mintId } from '../../ids/id';
import { countingStores } from './find-many.fixtures';

const unknown = '018f0000-0000-7000-8000-000000000000';

async function three(auth: ReturnType<typeof setup>['auth']) {
	const users = [];
	for (const n of [1, 2, 3]) {
		users.push(
			await auth.create({ email: `u${n}@example.test`, name: `U${n}` }),
		);
	}
	return users.map((user) => user.id) as [string, string, string];
}

describe('findMany', () => {
	it('answers in the order the ids were given, not in creation order', async () => {
		const { auth } = setup();
		const [a, b, c] = await three(auth);

		const found = await auth.findMany([c, a, b]);

		expect(found.map((user) => user.id)).toEqual([c, a, b]);
		expect(found[0]).toEqual((await auth.find(c)) as never);
	});

	it('leaves out an unknown id and a malformed one, and never rejects for them', async () => {
		const { auth } = setup();
		const [a, b] = await three(auth);

		const found = await auth.findMany([unknown, a, '../../etc', b, '']);

		expect(found.map((user) => user.id)).toEqual([a, b]);
	});

	it('answers a repeated id once, at its first place', async () => {
		const { auth } = setup();
		const [a, b] = await three(auth);

		const found = await auth.findMany([b, a, b, a]);

		expect(found.map((user) => user.id)).toEqual([b, a]);
	});

	it('answers [] for an empty list without reaching the store', async () => {
		const { store, calls } = countingStores({ batch: true });
		const { auth } = setup({ store });

		expect(await auth.findMany([])).toEqual([]);
		expect(await auth.findMany(['not-an-id'])).toEqual([]);
		expect(calls.batches).toEqual([]);
		expect(calls.findUser).toBe(0);
	});

	it("leaves out another type's user, as find answers null for one", async () => {
		const { auth } = clinic();
		const patient = await auth.patient.create({
			email: 'p@example.test',
			birthDate: '1990-01-01',
		});
		const staff = await auth.staff.create({ username: 'grace', service: 'x' });

		const found = await auth.staff.findMany([patient.id, staff.id]);

		expect(found.map((user) => user.id)).toEqual([staff.id]);
		expect(found[0]?.type).toBe('staff');
	});

	it('refuses something other than an array with a bare TypeError', async () => {
		const { auth } = setup();

		const error = await rejection(auth.findMany(unknown as never));

		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toBe(
			'findMany: ids must be an array of user ids',
		);
	});
});

describe('findMany over a store with findUsers', () => {
	it('reads in one findUsers call, and never calls findUser', async () => {
		const { store, calls } = countingStores({ batch: true });
		const { auth } = setup({ store });
		const [a, b, c] = await three(auth);

		await auth.findMany([a, b, c, a, unknown]);

		expect(calls.batches).toEqual([4]);
		expect(calls.findUser).toBe(0);
	});

	it('reads a long list 100 ids per call, one call after another', async () => {
		const { store, calls } = countingStores({ batch: true });
		const { auth } = setup({ store });
		const [a] = await three(auth);
		const ids = [...Array.from({ length: 249 }, () => mintId()), a];

		const found = await auth.findMany(ids);

		expect(calls.batches).toEqual([100, 100, 50]);
		expect(found.map((user) => user.id)).toEqual([a]);
	});
});

describe('findMany over a store without findUsers', () => {
	it('falls back to findUser, at most ten at once, with the same answer', async () => {
		const { store, calls } = countingStores({ batch: false });
		const { auth } = setup({ store });
		const [a, b, c] = await three(auth);
		const ids = [c, ...Array.from({ length: 30 }, () => mintId()), a, b, a];

		const found = await auth.findMany(ids);

		expect(found.map((user) => user.id)).toEqual([c, a, b]);
		expect(calls.findUser).toBe(33);
		expect(calls.mostInFlight).toBe(10);
		expect(calls.batches).toEqual([]);
	});
});

describe('findMany under an outage', () => {
	it('rejects with STORE_FAILED when findUsers fails — never a shorter list', async () => {
		const { store, calls } = countingStores({ batch: true });
		const { auth } = setup({ store });
		const [a] = await three(auth);
		calls.failing = true;

		const error = (await rejection(auth.findMany([a]))) as JanusError;

		expect(error.code).toBe('STORE_FAILED');
	});

	it('rejects with STORE_FAILED when a fallback findUser fails', async () => {
		const { store, calls } = countingStores({ batch: false });
		const { auth } = setup({ store });
		const [a, b] = await three(auth);
		calls.failing = true;

		const error = (await rejection(auth.findMany([a, b]))) as JanusError;

		expect(error.code).toBe('STORE_FAILED');
	});

	it('rejects with STORE_FAILED when findUsers answers no list', async () => {
		const { store } = countingStores({ batch: true });
		store.users.findUsers = async () => null as never;
		const { auth } = setup({ store });
		const [a] = await three(auth);

		const error = (await rejection(auth.findMany([a]))) as JanusError;

		expect(error.code).toBe('STORE_FAILED');
		expect(error.message).toContain('users.findUsers answered no list');
	});
});
