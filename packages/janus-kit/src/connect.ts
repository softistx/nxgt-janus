import type { PgDatabase } from '@nxgt/drizzle/pg';
import {
	createDrizzleAdapter,
	defineJanusTables,
	type JanusTables,
} from '@nxgt/janus-drizzle';
import { createRedisStores } from '@nxgt/janus-redis';
import type { RedisConnection } from '@nxgt/redis';
import { SQL } from 'bun';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { KitConfig, PostgresConfig, RedisConfig } from './config';
import { type Health, type Probe, probe } from './health';

/** What `connectKit` answers: `auth`, `access` when configured, and the rest. */
export type Kit<A extends object, P extends object> = {
	/** What your `auth` returned, instrumented when `telemetry` is on. */
	readonly auth: A;
	/** The Drizzle instance over Janus's database. */
	readonly db: PgDatabase;
	/** The Redis connection, when `redis` is configured. */
	readonly redis: RedisConnection | undefined;
	/**
	 * PostgreSQL's and Redis's answers to a round trip, within `timeoutMs`
	 * (2 s by default). **Never throws**: a health route always has something
	 * to report.
	 */
	ping(options?: { readonly timeoutMs?: number }): Promise<Health>;
	/**
	 * Closes what the kit opened — Redis, then PostgreSQL — and nothing it
	 * was handed. Idempotent.
	 */
	close(): Promise<void>;
} & ([P] extends [never]
	? unknown
	: {
			/** What your `access` returned, instrumented when `telemetry` is on. */
			readonly access: P;
		}) &
	AsyncDisposable;

/**
 * Opens the connections, checks that Janus's tables are there, and builds
 * `auth` and `access` over them.
 *
 * ```ts
 * export const kit = await connectKit(config);
 * const current = await kit.auth.authenticate(request);
 * await kit.close(); // or `await using kit = await connectKit(config)`
 * ```
 *
 * **It fails here, not at the first sign-in**: a database that does not
 * answer, or one without the tables your migrations create, rejects with an
 * `Error` naming what to do, after closing whatever it had opened.
 */
export async function connectKit<A extends object, P extends object = never>(
	config: KitConfig<A, P>,
): Promise<Kit<A, P>> {
	const closers: (() => Promise<void>)[] = [];
	const closeAll = async () => {
		// Redis first: it was opened last.
		for (const close of closers.splice(0).reverse()) {
			await close().catch(() => undefined);
		}
	};

	try {
		const { db, probe: postgres } = openPostgres(config.postgres, closers);
		const tables = config.postgres.tables ?? defineJanusTables();
		await assertTables(db, tables);

		const redis = await openRedis(config.redis, closers);
		const drizzleAdapter = createDrizzleAdapter(db, { tables });
		const adapters = {
			store:
				redis === undefined
					? drizzleAdapter.store
					: {
							...drizzleAdapter.store,
							...createRedisStores(redis, {
								...(config.redis?.prefix === undefined
									? {}
									: { prefix: config.redis.prefix }),
							}),
						},
			relations: drizzleAdapter.relations,
		};

		const instrument =
			config.telemetry === true ? await loadTelemetry() : undefined;
		let auth = config.auth(adapters);
		if (instrument !== undefined) auth = instrument.janus(auth);
		let access: P | undefined;
		if (config.access !== undefined) {
			access = config.access({ relations: adapters.relations, auth });
			if (instrument !== undefined) access = instrument.permissions(access);
		}

		const probes: Record<string, Probe> = { postgres };
		if (redis !== undefined) {
			probes.redis = (timeoutMs) => redis.ping({ timeoutMs });
		}

		let closing: Promise<void> | undefined;
		const close = () => {
			closing ??= closeAll();
			return closing;
		};
		const kit = {
			auth,
			...(config.access === undefined ? {} : { access }),
			db,
			redis,
			ping: async (options?: { readonly timeoutMs?: number }) =>
				await probe(probes, options?.timeoutMs ?? 2_000),
			close,
			[Symbol.asyncDispose]: close,
		};
		return Object.freeze(kit) as unknown as Kit<A, P>;
	} catch (error) {
		await closeAll();
		throw error;
	}
}

function openPostgres(
	{ url, db }: PostgresConfig,
	closers: (() => Promise<void>)[],
): { db: PgDatabase; probe: Probe } {
	if (db !== undefined) {
		return { db, probe: (timeoutMs) => roundTrip(db, timeoutMs) };
	}
	const client = new SQL(url as string);
	closers.push(() => client.close());
	const opened = drizzle({ client }) as unknown as PgDatabase;
	return { db: opened, probe: (timeoutMs) => roundTrip(opened, timeoutMs) };
}

async function openRedis(
	redis: RedisConfig | undefined,
	closers: (() => Promise<void>)[],
): Promise<RedisConnection | undefined> {
	if (redis === undefined) return undefined;
	if (redis.connection !== undefined) return redis.connection;
	const { connectRedis } = await import('@nxgt/redis');
	const connection = await connectRedis(redis.url as string, {
		enableOfflineQueue: false,
		...redis.clientOptions,
	}).catch((cause: unknown) => {
		// A refused configuration — this URL already connected with other
		// options — is not an outage: it passes through as it is.
		if (cause instanceof TypeError) throw cause;
		throw new Error(
			'connectKit: Redis did not answer. Check `redis.url`, or leave `redis` out to keep sessions in PostgreSQL.',
			{ cause },
		);
	});
	closers.push(() => connection.close());
	return connection;
}

/** `select 1`, answered within `timeoutMs`, as `ping` reports it. */
async function roundTrip(db: PgDatabase, timeoutMs: number) {
	const started = performance.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			db.execute(sql`select 1`),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`ping: no answer in ${timeoutMs}ms`)),
					timeoutMs,
				);
			}),
		]);
		return { ok: true as const, latencyMs: performance.now() - started };
	} catch (error) {
		return { ok: false as const, error };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Every table the stores query, by the name the configuration gives it. A
 * missing one is the most likely first-run mistake — migrations not applied,
 * or applied to another database — and would otherwise surface as the first
 * sign-up's `STORE_FAILED`.
 */
async function assertTables(db: PgDatabase, tables: JanusTables) {
	const names = Object.values(tables).map((table) => {
		const { name, schema } = getTableConfig(table);
		return schema === undefined ? `"${name}"` : `"${schema}"."${name}"`;
	});
	let reply: unknown;
	try {
		reply = await db.execute(
			sql`select name from unnest(${sql.raw(
				`array[${names.map((n) => `'${n.replaceAll("'", "''")}'`).join(', ')}]`,
			)}) as name where to_regclass(name) is null`,
		);
	} catch (cause) {
		throw new Error(
			'connectKit: PostgreSQL did not answer. Check `postgres.url`, and that the database exists.',
			{ cause },
		);
	}
	const rows = (
		Array.isArray(reply) ? reply : (reply as { rows: unknown[] }).rows
	) as { name: string }[];
	if (rows.length > 0) {
		throw new Error(
			`connectKit: Janus's tables are missing from this database: ${rows
				.map((row) => row.name)
				.join(
					', ',
				)}. Apply the migration drizzle-kit generated from defineJanusTables(), to the database \`postgres\` names.`,
		);
	}
}

/** `@nxgt/janus-telemetry`, an optional peer: loaded only when asked for. */
async function loadTelemetry() {
	try {
		const telemetry = await import('@nxgt/janus-telemetry');
		return {
			janus: <A>(auth: A) =>
				telemetry.instrumentJanus(
					auth as Parameters<typeof telemetry.instrumentJanus>[0],
				) as A,
			permissions: <P>(access: P) =>
				telemetry.instrumentPermissions(
					access as Parameters<typeof telemetry.instrumentPermissions>[0],
				) as P,
		};
	} catch (cause) {
		throw new Error(
			'connectKit: `telemetry: true` needs @nxgt/janus-telemetry — `bun add @nxgt/janus-telemetry @nxgt/telemetry`.',
			{ cause },
		);
	}
}
