import { afterAll, beforeAll } from 'bun:test';
import { connectRedis, type RedisConnection } from '@nxgt/redis';
import { startRedis, type TestServer } from './server';

let opened = 0;

/** One case's Redis: a user of its own, allowed only its own prefix. */
export interface RedisCase {
	readonly redis: RedisConnection;
	readonly prefix: string;
	/** Takes every command away from the case's user: Redis answers `NOPERM`. */
	fail(): Promise<void>;
	close(): Promise<void>;
}

/**
 * Opens a case as a Redis user of its own, allowed only the keys of its own
 * prefix — so nothing one case writes is seen by the next, and an outage is
 * the server's own refusal, `ACL SETUSER … -@all`, rather than a wrapper.
 */
export async function openCase(server: TestServer): Promise<RedisCase> {
	opened += 1;
	const user = `case${opened}`;
	const prefix = `${user}:`;
	await server.admin.send('ACL', [
		'SETUSER',
		user,
		'on',
		`>${user}-secret`,
		`~${prefix}*`,
		'+@all',
	]);
	const redis = await connectRedis(
		`redis://${user}:${user}-secret@${server.host}:${server.port}`,
	);
	return {
		redis,
		prefix,
		fail: async () => {
			await server.admin.send('ACL', ['SETUSER', user, '-@all']);
		},
		close: async () => {
			await redis.close();
			await server.admin.send('ACL', ['DELUSER', user]);
		},
	};
}

export interface RedisPerFile {
	/** The file's server, between its beforeAll and its afterAll; a throw outside. */
	readonly server: TestServer;
	/** Runs `body` against a case of its own, closed whatever happens. */
	withCase(body: (test: RedisCase) => Promise<void>): Promise<void>;
}

/**
 * Starts a real Redis before the calling spec file's cases and stops it after
 * them: one server per file, as `test/server.ts` has it.
 */
export function redisPerFile(): RedisPerFile {
	let server: TestServer | undefined;
	const started = () => {
		if (server === undefined) throw new Error('Redis is not running');
		return server;
	};

	beforeAll(async () => {
		server = await startRedis();
	}, 300_000);

	afterAll(async () => {
		await server?.stop();
		server = undefined;
	});

	return {
		get server() {
			return started();
		},
		async withCase(body) {
			const test = await openCase(started());
			try {
				await body(test);
			} finally {
				await test.close();
			}
		},
	};
}
