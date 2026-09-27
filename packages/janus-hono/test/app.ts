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
import { Hono } from 'hono';
import { z } from 'zod';
import { janusErrors } from '../src/errors';
import { byParam, permission } from '../src/permission';
import { provide } from '../src/provide';
import { session } from '../src/session';

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

/**
 * An app whose routes load a record and ask permission() for it, or grant
 * through provide(): what the permission specs and provide.spec.ts share.
 */
export function app() {
	const context = setup();
	const { auth, access } = context;
	const records = new Map<string, MedicalRecord>([
		['r1', { id: 'r1', doctorId: null, title: 'Blood test' }],
	]);
	const loads: string[] = [];
	// `c.req.param()` in a middleware is `string | undefined`: Hono types the
	// path in the route's own handler only.
	const load = (id: string | undefined) => {
		if (id === undefined) return null;
		loads.push(id);
		return records.get(id) ?? null;
	};

	const routes = new Hono()
		.use(session(auth))
		.get(
			'/records/:id',
			permission(access, 'view', 'record', byParam('id', load)),
			(c) => c.json({ title: c.var.object.title }),
		)
		// A route with no :id: byParam answers null, which is a 404.
		.get(
			'/records',
			permission(access, 'view', 'record', byParam('id', load)),
			(c) => c.json({ title: c.var.object.title }),
		)
		.put(
			'/records/:id',
			permission(access, 'edit', 'record', (c) => load(c.req.param('id')), {
				ctx: (c) => ({ locked: c.req.header('x-locked') === 'yes' }),
			}),
			(c) => c.body(null, 204),
		)
		.get(
			'/as/:subject/records/:id',
			permission(access, 'view', 'record', (c) => load(c.req.param('id')), {
				subject: (c) => ({ type: 'patient', id: c.req.param('subject') ?? '' }),
			}),
			(c) => c.json({ title: c.var.object.title }),
		)
		.post(
			'/records',
			session(auth, { type: 'patient', required: true }),
			provide({ access }),
			async (c) => {
				const record = { id: 'r2', doctorId: null, title: 'X-ray' };
				records.set(record.id, record);
				await c.var.access.grant(
					{ type: 'record', id: record.id },
					'owners',
					c.var.user,
				);
				return c.json({ id: record.id }, 201);
			},
		);
	routes.onError(janusErrors());
	return { ...context, routes, records, loads };
}
