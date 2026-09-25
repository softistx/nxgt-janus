/**
 * What the MongoDB kit refuses at compile time: each `@ts-expect-error` is a
 * plausible mistake that must not compile. What must keep compiling is above
 * them.
 */

import { janus, scryptHasher } from '@nxgt/janus';
import type { Db } from 'mongodb';
import { z } from 'zod';
import { connectKit, defineConfig } from '../../src/mongo/index';

declare const db: Db;

const auth = (
	adapters: Parameters<Parameters<typeof defineConfig>[0]['auth']>[0],
) =>
	janus({
		user: z.object({ email: z.email() }),
		password: { login: 'email' },
		hasher: scryptHasher(),
		...adapters,
	});

// Must keep compiling: the kit answers the Db, and ping names MongoDB.
export const kit = await connectKit(
	defineConfig({ mongo: { url: 'mongodb://localhost/janus' }, auth }),
);
export const name: string = kit.db.databaseName;
export const mongoHealth = (await kit.ping()).mongo.ok;

// @ts-expect-error 1. access on a kit configured without it
kit.access;
// @ts-expect-error 2. ping names the database the kit is over
(await kit.ping()).postgres;
// @ts-expect-error 3. both a URL and a Db
defineConfig({ mongo: { url: 'mongodb://localhost/janus', db }, auth });
defineConfig({
	// @ts-expect-error 4. client options beside a Db whose client is already open
	mongo: { db, clientOptions: { appName: 'janus' } },
	auth,
});
// @ts-expect-error 5. the PostgreSQL key, given to the MongoDB kit
defineConfig({ postgres: { url: 'postgres://localhost/janus' }, auth });
// @ts-expect-error 6. neither a URL nor a Db
defineConfig({ mongo: {}, auth });
