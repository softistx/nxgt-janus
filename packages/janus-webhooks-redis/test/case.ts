import { afterAll, beforeAll } from 'bun:test';
import type { WebhookQueueMethod } from '@nxgt/janus-webhooks/conformance';
import { connectRedis, type RedisConnection } from '@nxgt/redis';
import { startRedis, type TestServer } from './server';

let opened = 0;

/** One case's Redis: users of its own, allowed only its own prefix. */
export interface RedisCase {
	/** The connection of the case's first user: what a spec writes through. */
	readonly redis: RedisConnection;
	readonly prefix: string;
	/**
	 * One connection per method, each as a Redis user of its own, so that
	 * a fault takes one method away and leaves the others answering.
	 */
	readonly connections: Readonly<Record<WebhookQueueMethod, RedisConnection>>;
	/** Makes Redis itself refuse `method`, as a real server error. */
	fail(method: WebhookQueueMethod): Promise<void>;
	close(): Promise<void>;
}

/** Every method, once: a method the port gains fails to compile here. */
const EVERY_METHOD = {
	insertDeliveries: true,
	claimDeliveries: true,
	claimOrphanedDeliveries: true,
	extendLease: true,
	scheduleRetry: true,
	deleteDelivery: true,
} as const satisfies Record<WebhookQueueMethod, true>;

const METHODS = Object.keys(EVERY_METHOD) as readonly WebhookQueueMethod[];

/**
 * Opens a case as Redis users of its own — one per method — allowed only the
 * keys of the case's prefix, so nothing one case writes is seen by the next.
 *
 * **The faults are the server's.** A method's user loses every command,
 * `ACL SETUSER … -@all`, and Redis answers `NOPERM` — except the insert's,
 * which keeps its commands and the keys it reads, but may write only the
 * set of endpoints and the keys ending in `:a`: its script is refused
 * **half-way**, after every write for the first endpoint of
 * `['a', 'b', 'c']`, which is what an insert that is all or none must undo.
 *
 * Adapted from `@nxgt/janus-redis`'s `test/case.ts`, which fails one user
 * whole: that port's fault takes the store down, this one's a method.
 */
export async function openCase(server: TestServer): Promise<RedisCase> {
	opened += 1;
	const name = `case${opened}`;
	const prefix = `${name}:`;
	const userOf = (method: WebhookQueueMethod) => `${name}-${method}`;
	const entries = await Promise.all(
		METHODS.map(async (method) => {
			const user = userOf(method);
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
			return [method, redis] as const;
		}),
	);
	const connections = Object.fromEntries(entries) as Record<
		WebhookQueueMethod,
		RedisConnection
	>;
	return {
		redis: connections.insertDeliveries,
		prefix,
		connections,
		fail: async (method) => {
			const rules =
				method === 'insertDeliveries'
					? [
							'resetkeys',
							`%R~${prefix}*`,
							`%W~${prefix}*:a`,
							`%W~${prefix}endpoints`,
						]
					: ['-@all'];
			await server.admin.send('ACL', ['SETUSER', userOf(method), ...rules]);
		},
		close: async () => {
			for (const [method, redis] of entries) {
				await redis.close();
				await server.admin.send('ACL', ['DELUSER', userOf(method)]);
			}
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
