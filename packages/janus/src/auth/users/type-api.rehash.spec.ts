import { describe, expect, it } from 'bun:test';
import {
	ada,
	hasher,
	password,
	person,
	rejection,
	setup,
} from '../../../test/auth';
import type { JanusError } from '../../errors/janus-error';
import { mintId } from '../../ids/id';
import { scryptHasher } from '../hashers';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

describe('rehash on sign-in', () => {
	/** A hasher an old database was written with: toy, and the point. */
	const legacy = {
		prefix: '$legacy$',
		hash: async (plain: string) => `$legacy$${plain}`,
		verify: async (plain: string, hash: string) => hash === `$legacy$${plain}`,
	};

	/** A store holding Ada with a legacy hash, and an instance that verifies it. */
	async function migrating(
		wrap: (store: JanusStores) => JanusStores = (store) => store,
	) {
		const store = createMemoryStores();
		const createdAt = new Date(Date.UTC(2020, 0, 1));
		await store.users.insertUser({
			id: mintId(),
			type: 'user',
			schemaVersion: '1',
			active: true,
			fields: ada,
			logins: [ada.email],
			password: { hash: await legacy.hash(password), updatedAt: createdAt },
			secondFactor: null,
			emailVerifiedAt: null,
			version: 0,
			createdAt,
			updatedAt: createdAt,
		});
		const auth = janus({
			user: person,
			password: { login: 'email' },
			store: wrap(store),
			hasher,
			verifiers: [legacy],
		});
		return { auth, store, createdAt };
	}

	it('rewrites a hash another hasher wrote, keeping when the password was set', async () => {
		const { auth, store, createdAt } = await migrating();

		const { user } = await auth.signIn({ email: ada.email, password });
		const record = await store.users.findUser(user.id);

		expect(record?.password?.hash).toStartWith('$scrypt$ln=10,');
		expect(record?.password?.updatedAt).toEqual(createdAt);
		expect(user.version).toBe(1);
		// Once rewritten, a sign-in writes nothing.
		await auth.signIn({ email: ada.email, password });
		expect((await store.users.findUser(user.id))?.version).toBe(1);
	});

	it('rewrites a hash its own hasher wrote with other parameters', async () => {
		const { auth, store } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const raised = janus({
			user: person,
			password: { login: 'email' },
			store,
			hasher: scryptHasher({ cost: 11 }),
		});

		await raised.signIn({ email: ada.email, password });

		expect((await store.users.findUser(user.id))?.password?.hash).toStartWith(
			'$scrypt$ln=11,',
		);
	});

	it('signs in all the same when a concurrent update wins the race, and rehashes next time', async () => {
		let raced = false;
		const { auth, store } = await migrating((inner) => ({
			...inner,
			users: {
				...inner.users,
				// Somebody else writes between the read and the rehash.
				async findUserByLogin(type, login) {
					const found = await inner.users.findUserByLogin(type, login);
					if (found !== null && !raced) {
						raced = true;
						await inner.users.updateUser(
							found.id,
							{ updatedAt: new Date(), fields: { ...ada, name: 'Ada King' } },
							found.version,
						);
					}
					return found;
				},
			},
		}));

		const { user } = await auth.signIn({ email: ada.email, password });

		expect((await store.users.findUser(user.id))?.password?.hash).toStartWith(
			'$legacy$',
		);
		await auth.signIn({ email: ada.email, password });
		expect((await store.users.findUser(user.id))?.password?.hash).toStartWith(
			'$scrypt$',
		);
	});

	it('fails the sign-in when the rehash meets an outage, and opens no session', async () => {
		let sessions = 0;
		const { auth } = await migrating((inner) => ({
			...inner,
			users: {
				...inner.users,
				updateUser: async () => {
					throw new Error('connect ECONNREFUSED');
				},
			},
			sessions: {
				...inner.sessions,
				insertSession: async (record) => {
					sessions += 1;
					return inner.sessions.insertSession(record);
				},
			},
		}));

		const error = (await rejection(
			auth.signIn({ email: ada.email, password }),
		)) as JanusError;

		expect(error.code).toBe('STORE_FAILED');
		expect(sessions).toBe(0);
	});
});
