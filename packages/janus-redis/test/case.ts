import { connectRedis, type RedisConnection } from '@nxgt/redis';
import type { TestServer } from './server';

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
