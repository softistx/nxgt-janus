/**
 * `janus()` wired the way an application wires it — Zod, scrypt, the
 * reference store, a clock the spec drives — plus a switch that takes the
 * sessions store down, for the specs under `src/`.
 */

import {
	createMemoryStores,
	fixedClock,
	janus,
	scryptHasher,
} from '@nxgt/janus';
import { z } from 'zod';

export const ada = { email: 'ada@example.test', name: 'Ada Lovelace' };
export const password = 'correct horse';

export const HOUR = 3_600_000;

export function setup() {
	const clock = fixedClock(Date.UTC(2026, 8, 24));
	const stores = createMemoryStores();
	const outage = { on: false };
	const find = stores.sessions.findSessionByTokenHash.bind(stores.sessions);

	const auth = janus({
		users: {
			patient: {
				schema: z.strictObject({ email: z.email(), name: z.string() }),
				password: { login: 'email' },
				session: { lifespan: '7d', renewAfter: '1d' },
			},
			staff: {
				schema: z.strictObject({ username: z.string() }),
				password: { login: 'username' },
			},
		},
		store: {
			...stores,
			sessions: {
				...stores.sessions,
				findSessionByTokenHash: (hash) => {
					if (outage.on) throw new Error('connection refused');
					return find(hash);
				},
			},
		},
		hasher: scryptHasher({ cost: 10 }),
		clock,
	});

	return { auth, clock, outage };
}

export const bearer = (token: string) => ({
	headers: { authorization: `Bearer ${token}` },
});

export const cookie = (token: string) => ({
	headers: { cookie: `janus-session=${token}` },
});
