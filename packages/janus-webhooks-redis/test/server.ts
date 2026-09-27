import { join } from 'node:path';
import { RedisClient } from 'bun';
import RedisMemoryServer from 'redis-memory-server';
import RedisBinary from 'redis-memory-server/lib/util/RedisBinary';

/**
 * The Redis the specs run against: pinned, as `@nxgt/redis`'s own specs pin
 * it, so a release of the server does not quietly change what is measured.
 *
 * Nobody publishes a prebuilt `redis-server`, so `redis-memory-server`
 * compiles it from source on the first start — about two minutes, measured in
 * nxgt-data — into the repository's git-ignored `.cache/redis`, which CI
 * caches. `$REDIS_BIN` names a `redis-server` to use instead.
 */
export const REDIS_VERSION = '7.4.1';

const REDIS_CACHE = join(
	new URL('../../..', import.meta.url).pathname,
	'.cache',
	'redis',
);

/** The `redis-server` the specs run, built first if it is not cached yet. */
export async function redisBinary(): Promise<string> {
	const given = process.env.REDIS_BIN;
	if (given) return given;
	return await RedisBinary.getPath({
		version: REDIS_VERSION,
		downloadDir: REDIS_CACHE,
	});
}

export interface TestServer {
	readonly host: string;
	readonly port: number;
	/** The default user's client: it creates the users each case runs as. */
	readonly admin: RedisClient;
	stop(): Promise<void>;
}

/** A real Redis, one per spec file. */
export async function startRedis(): Promise<TestServer> {
	const server = await RedisMemoryServer.create({
		binary: { systemBinary: await redisBinary() },
	});
	const host = await server.getHost();
	const port = await server.getPort();
	const admin = new RedisClient(`redis://${host}:${port}`);
	await admin.connect();
	return {
		host,
		port,
		admin,
		stop: async () => {
			admin.close();
			await server.stop();
		},
	};
}
