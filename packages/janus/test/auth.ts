/**
 * `janus()`, wired the way an application wires it — Zod schemas, scrypt, the
 * reference store, a clock the spec drives — for the specs under `src/auth/`.
 *
 * Two applications: `setup()` has one user type, `clinic()` has patients
 * and staff, where staff sign in with a username and have no e-mail.
 *
 * scrypt at cost 10 rather than 17: the specs exercise every line of the
 * hasher, and do not need 128 MiB per hash to do it.
 */

import { z } from 'zod';
import type { UserEventListener } from '../src/auth/events';
import { scryptHasher } from '../src/auth/hashers';
import { janus } from '../src/auth/janus';
import { createMemoryStores } from '../src/auth/port/memory';
import type { JanusStores } from '../src/auth/port/types';
import type { RelationStore } from '../src/permissions/port/types';
import { fixedClock } from '../src/time/clock';

export const hasher = scryptHasher({ cost: 10 });

export const person = z.strictObject({
	email: z.email(),
	name: z.string().max(256),
	nickname: z.string().optional(),
});

export const ada = { email: 'ada@example.test', name: 'Ada Lovelace' };
export const password = 'correct horse';

export function setup(options: { store?: JanusStores } = {}) {
	const clock = fixedClock(Date.UTC(2026, 8, 23));
	const store = options.store ?? createMemoryStores();
	const auth = janus({
		user: person,
		password: { login: 'email' },
		session: { lifespan: '7d', renewAfter: '1d' },
		store,
		hasher,
		clock,
	});

	return { auth, store, clock };
}

export const Patient = z.strictObject({
	email: z.email(),
	birthDate: z.string(),
});

export const Staff = z.strictObject({
	username: z.string(),
	service: z.string(),
});

export function clinic(
	options: {
		store?: JanusStores;
		relations?: RelationStore;
		events?: UserEventListener;
	} = {},
) {
	const clock = fixedClock(Date.UTC(2026, 8, 23));
	const store = options.store ?? createMemoryStores();
	const auth = janus({
		users: {
			patient: { schema: Patient, password: { login: 'email' } },
			staff: {
				schema: Staff,
				password: { login: 'username', normalize: 'none' },
				session: { lifespan: '8h', renewAfter: false },
			},
		},
		store,
		hasher,
		clock,
		...(options.relations === undefined
			? {}
			: { relations: options.relations }),
		...(options.events === undefined ? {} : { events: options.events }),
	});

	return { auth, store, clock };
}

/** A request carrying a session token, as a bearer. */
export const bearer = (token: string) =>
	new Headers({ authorization: `Bearer ${token}` });

/** Settles a rejection where it is created, per AGENTS.md. */
export const rejection = (promise: Promise<unknown>): Promise<unknown> =>
	promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(error: unknown) => error,
	);
