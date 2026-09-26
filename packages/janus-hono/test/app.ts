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
import {
	createMemoryRelations,
	defineModel,
	fromField,
	permissions,
	when,
} from '@nxgt/janus/permissions';
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

	// A patient owns their records; the doctor named on one reads it too, and
	// an owner edits one only while it is not locked.
	const model = defineModel({
		subjects: auth.types,
		types: {
			record: {
				related: {
					owners: ['patient'],
					doctors: fromField('doctorId', 'staff'),
				},
				permits: {
					view: ['owners', 'doctors'],
					edit: [when('owners', (ctx: { locked: boolean }) => !ctx.locked)],
				},
			},
		},
	});
	const relations = createMemoryRelations();
	const has = relations.has.bind(relations);
	const access = permissions({
		model,
		store: {
			...relations,
			has: (tuple) => {
				if (outage.on) throw new Error('connection refused');
				return has(tuple);
			},
		},
	});

	return { auth, access, clock, outage };
}

/** The records the application keeps, outside Janus. */
export interface MedicalRecord {
	readonly id: string;
	readonly doctorId: string | null;
	readonly title: string;
}

export const bearer = (token: string) => ({
	headers: { authorization: `Bearer ${token}` },
});

export const cookie = (token: string) => ({
	headers: { cookie: `janus-session=${token}` },
});
