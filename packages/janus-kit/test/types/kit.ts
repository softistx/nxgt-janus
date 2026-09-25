/**
 * What the kit refuses at compile time: each `@ts-expect-error` is a
 * plausible mistake that must not compile. What must keep compiling is above
 * them.
 */

import type { PgDatabase } from '@nxgt/drizzle/pg';
import { janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import type { RedisConnection } from '@nxgt/redis';
import { z } from 'zod';
import { connectKit, defineConfig } from '../../src/index';

declare const db: PgDatabase;
declare const connection: RedisConnection;

const auth = (
	adapters: Parameters<Parameters<typeof defineConfig>[0]['auth']>[0],
) =>
	janus({
		users: {
			patient: {
				schema: z.object({ email: z.email() }),
				password: { login: 'email' },
			},
			staff: {
				schema: z.object({ username: z.string() }),
				password: { login: 'username' },
			},
		},
		hasher: scryptHasher(),
		...adapters,
	});

// Must keep compiling: auth's types reach access, and both reach the kit.
export const kit = await connectKit(
	defineConfig({
		postgres: { url: 'postgres://localhost/janus' },
		redis: { connection, prefix: 'clinic:' },
		auth,
		access: ({ relations, auth }) =>
			permissions({
				model: defineModel({
					subjects: auth.types,
					types: {
						record: {
							relations: { doctor: ['staff'], patient: ['patient'] },
							permissions: { view: ['doctor', 'patient'] },
						},
					},
				}),
				store: relations,
			}),
	}),
);
export const signIn = kit.auth.staff.signIn({ username: 'ada', password: 'x' });
export const allowed = kit.access.can({ type: 'staff', id: 's1' }, 'view', {
	type: 'record',
	id: 'r1',
});

const authOnly = await connectKit(defineConfig({ postgres: { db }, auth }));

// @ts-expect-error 1. access on a kit configured without it
authOnly.access;
// @ts-expect-error 2. a user type the auth does not have
kit.auth.nurse;
// @ts-expect-error 3. a permission the model does not have
kit.access.can({ type: 'staff', id: 's1' }, 'edit', {
	type: 'record',
	id: 'r1',
});
// @ts-expect-error 4. both a URL and a Drizzle instance
defineConfig({ postgres: { url: 'postgres://localhost/janus', db }, auth });
defineConfig({
	postgres: { db },
	// @ts-expect-error 5. both a Redis URL and a connection
	redis: { url: 'redis://localhost', connection },
	auth,
});
defineConfig({
	postgres: { db },
	// @ts-expect-error 6. client options beside a connection that is already open
	redis: { connection, clientOptions: { tls: true } },
	auth,
});
// @ts-expect-error 7. the schema of the tables, not the tables built in it
defineConfig({ postgres: { db, schema: 'janus' }, auth });
// @ts-expect-error 8. no auth: the kit wires janus(), it does not replace it
defineConfig({ postgres: { db } });
