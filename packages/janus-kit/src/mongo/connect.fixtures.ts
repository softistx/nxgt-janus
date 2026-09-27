import { afterAll, beforeAll } from 'bun:test';
import { janus, scryptHasher } from '@nxgt/janus';
import { syncMongoAdapter } from '@nxgt/janus-mongo';
import { closeMongo } from '@nxgt/mongo';
import type { Db } from 'mongodb';
import { z } from 'zod';
import { startMongo, type TestServer } from '../../test/mongo';
import type { defineConfig } from './config';

// What the connect.*.spec.ts files share: a replica set of each file's own,
// a database per case in it, and the auth every kit is wired with.

export interface MongoPerFile {
	/** A database of its own per case, synced unless asked otherwise. */
	database(synced?: boolean): Promise<Db>;
	/** The replica set's URL, naming `name` as its database. */
	urlOf(name: string): string;
}

let databases = 0;

/**
 * Starts a real MongoDB before the calling spec file's cases and stops it
 * after them, closing what `@nxgt/mongo` opened first: one server per file,
 * as `test/mongo.ts` has it.
 */
export function mongoPerFile(): MongoPerFile {
	let server: TestServer | undefined;
	const started = () => {
		if (server === undefined) throw new Error('MongoDB is not running');
		return server;
	};

	beforeAll(async () => {
		server = await startMongo();
	}, 300_000);

	afterAll(async () => {
		await closeMongo();
		await server?.stop();
		server = undefined;
	});

	return {
		async database(synced = true) {
			databases += 1;
			const db = started().client.db(`kit${databases}`);
			if (synced) await syncMongoAdapter(db);
			return db;
		},
		urlOf(name) {
			const { hosts, replicaSet } = started().client.options;
			return `mongodb://${hosts.map(String).join(',')}/${name}?replicaSet=${replicaSet}`;
		},
	};
}

const user = z.object({ email: z.email() });
const hasher = scryptHasher({ cost: 10 });
export const auth = (
	adapters: Parameters<Parameters<typeof defineConfig>[0]['auth']>[0],
) => janus({ user, password: { login: 'email' }, hasher, ...adapters });
