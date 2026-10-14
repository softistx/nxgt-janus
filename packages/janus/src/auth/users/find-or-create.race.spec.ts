import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../test/rejection';
import { StoreConflict, StoreFailure } from '../../errors/janus-error';
import { createMemoryStores } from '../port/memory';
import {
	countingWrites,
	invitations,
	losingARace,
} from './find-or-create.fixtures';

const grace = { email: 'grace@example.test', name: 'Grace Hopper' };

describe('findOrCreate, on a lost race', () => {
	it('answers the competitor created: false, after reading the key once more', async () => {
		const { store, writes } = losingARace();
		const { auth, received } = invitations({ store });

		const answer = await auth.member.findOrCreate(grace.email, () => grace);

		expect(answer.created).toBe(false);
		expect(answer.user.email).toBe(grace.email);
		expect(writes.count).toBe(1);
		// The competitor's own call reports its creation; this one reports none.
		expect(received).toEqual([]);
		expect((await auth.member.findByEmail(grace.email))?.id).toBe(
			answer.user.id,
		);
	});

	it('answers the competitor on a type with a password too', async () => {
		const { store } = losingARace();
		const { auth } = invitations({ store });

		const answer = await auth.patient.findOrCreate(grace.email, () => ({
			...grace,
			password: 'correct horse',
		}));

		expect(answer.created).toBe(false);
		expect(answer.user.id).toBe(
			(await auth.patient.findByLogin(grace.email))?.id as string,
		);
	});

	it('rethrows LOGIN_TAKEN when the re-read finds nobody', async () => {
		const memory = createMemoryStores();
		const store = {
			...memory,
			users: {
				...memory.users,
				async insertUser(): Promise<never> {
					throw new StoreConflict('login', 'a login is taken');
				},
			},
		};
		const { auth } = invitations({ store });

		const error = await rejection(
			auth.member.findOrCreate(grace.email, () => grace),
		);

		expect(error).toBeInstanceOf(StoreConflict);
		expect(error).toMatchObject({ code: 'LOGIN_TAKEN' });
	});
});

describe('findOrCreate, on a store that fails', () => {
	it('rejects with STORE_FAILED when the lookup fails, never creating', async () => {
		const { store, writes } = countingWrites();
		const driver = new Error('connect ECONNREFUSED');
		const { auth } = invitations({
			store: {
				...store,
				users: {
					...store.users,
					findUserByLogin: async () => {
						throw driver;
					},
				},
			},
		});

		const error = await rejection(
			auth.member.findOrCreate(grace.email, () => grace),
		);

		expect(error).toBeInstanceOf(StoreFailure);
		expect(error).toMatchObject({ code: 'STORE_FAILED' });
		expect((error as StoreFailure).cause).toBe(driver);
		expect(writes.count).toBe(0);
	});

	it('rejects with STORE_FAILED when the write fails', async () => {
		const memory = createMemoryStores();
		const { auth } = invitations({
			store: {
				...memory,
				users: {
					...memory.users,
					insertUser: async () => {
						throw new Error('primary stepped down');
					},
				},
			},
		});

		const error = await rejection(
			auth.member.findOrCreate(grace.email, () => grace),
		);

		expect(error).toMatchObject({
			code: 'STORE_FAILED',
			operation: 'insertUser',
		});
	});
});
