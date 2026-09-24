import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';

/**
 * The mongod the specs run against, pinned as nxgt-data pins it: the memory
 * server's own default moves between its minor releases, and the build it
 * picks decides which OpenSSL it needs. 6.0 and up link OpenSSL 3, the one a
 * current distribution ships.
 *
 * **CI keys its mongod cache on this file**, so changing the version here is
 * what invalidates it.
 */
export const MONGOD_VERSION = '8.2.6';

/** The repository's git-ignored `.cache`, so a spec run downloads nothing twice. */
export const MONGOD_CACHE = join(
	new URL('../../..', import.meta.url).pathname,
	'.cache',
	'mongodb',
);

export interface TestServer {
	readonly client: MongoClient;
	/** Makes every one of these commands fail, as the server would, until `clearFailures`. */
	failAlways(commands: readonly string[], errorCode: number): Promise<void>;
	/** Turns the fail point off. `{ times: 0 }` would still fail one more command — measured in nxgt-data; `off` does not. */
	clearFailures(): Promise<void>;
	stop(): Promise<void>;
}

/**
 * A real MongoDB, one per spec file: a single-node replica set, started with
 * the test commands on, which is what `configureFailPoint` needs. Never on a
 * real deployment.
 */
export async function startMongo(): Promise<TestServer> {
	const replSet = await MongoMemoryReplSet.create({
		replSet: { count: 1, storageEngine: 'wiredTiger' },
		binary: { version: MONGOD_VERSION, downloadDir: MONGOD_CACHE },
		instanceOpts: [
			{
				// 10 seconds is the default, and a cold CI runner takes longer.
				launchTimeout: 60_000,
				args: ['--setParameter', 'enableTestCommands=1'],
			},
		],
	});

	// Polling, not streaming. Code 91 is a "node is shutting down" error, so the
	// driver marks the primary Unknown and asks its monitor to look again; a
	// streaming monitor answers only once its awaited `hello` returns, up to
	// `heartbeatFrequencyMS` (10 s) later, and every outage case after the
	// first timed out at 5 s waiting for a primary. Measured: 23/31 in 43 s
	// streaming, 31/31 in 11 s polling. A test-harness setting, not advice to
	// an application.
	const client = await MongoClient.connect(replSet.getUri(), {
		serverMonitoringMode: 'poll',
	});
	const admin = client.db('admin');

	return {
		client,
		failAlways: async (commands, errorCode) => {
			await admin.command({
				configureFailPoint: 'failCommand',
				mode: 'alwaysOn',
				data: { failCommands: commands, errorCode },
			});
		},
		clearFailures: async () => {
			await admin.command({ configureFailPoint: 'failCommand', mode: 'off' });
		},
		stop: async () => {
			await client.close();
			await replSet.stop({ doCleanup: true });
		},
	};
}
