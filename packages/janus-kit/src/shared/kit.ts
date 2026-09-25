import type { JanusStores } from '@nxgt/janus';
import type { RelationStore } from '@nxgt/janus/permissions';
import { createRedisStores } from '@nxgt/janus-redis';
import type { RedisConnection } from '@nxgt/redis';
import type { Database, RedisConfig, SharedConfig } from './config';
import { type HealthOf, type Probe, type Probes, probe } from './health';

/**
 * What `connectKit` answers, whatever the database: `auth`, `access` when
 * configured, `db`, and the rest. `Key` is the name `ping` reports the
 * database under.
 */
export type KitOf<
	A extends object,
	P extends object,
	Db,
	Key extends string,
> = {
	/** What your `auth` returned, instrumented when `telemetry` is on. */
	readonly auth: A;
	/** The database Janus's stores query. */
	readonly db: Db;
	/** The Redis connection, when `redis` is configured. */
	readonly redis: RedisConnection | undefined;
	/**
	 * The database's and Redis's answers to a round trip, within `timeoutMs`
	 * (2 s by default). **Never throws**: a health route always has something
	 * to report.
	 */
	ping(options?: { readonly timeoutMs?: number }): Promise<HealthOf<Key>>;
	/**
	 * Closes what the kit opened — Redis, then the database — and nothing it
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

/** A close, pushed as soon as what it closes is open. */
export type Closers = (() => Promise<void>)[];

/** What the database's module opened, and checked, for the kit to wire. */
export interface Opened<Db, Key extends string> {
	readonly database: Database<Key>;
	readonly db: Db;
	/** Its identity stores and relation store, built over `db`. */
	readonly store: JanusStores;
	readonly relations: RelationStore;
	readonly probe: Probe;
}

/**
 * Everything after the database: Redis, telemetry, `auth` and `access`,
 * `ping`, `close`. `open` opens and checks the database, pushing its close
 * onto `closers` as soon as there is something to close; **whatever fails
 * closes what was opened** before the error is seen.
 */
export async function assembleKit<
	A extends object,
	P extends object,
	Db,
	Key extends string,
>(
	config: SharedConfig<A, P>,
	open: (closers: Closers) => Promise<Opened<Db, Key>>,
): Promise<KitOf<A, P, Db, Key>> {
	const { closers, close, failStart } = lifecycle();
	try {
		const opened = await open(closers);
		const redis = await openRedis(config.redis, closers, opened.database.label);
		const adapters = {
			store:
				redis === undefined
					? opened.store
					: {
							...opened.store,
							...createRedisStores(redis, {
								...(config.redis?.prefix === undefined
									? {}
									: { prefix: config.redis.prefix }),
							}),
						},
			relations: opened.relations,
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

		const probes = {
			[opened.database.key]: opened.probe,
			...(redis === undefined
				? {}
				: { redis: (timeoutMs: number) => redis.ping({ timeoutMs }) }),
		} as Probes<Key>;
		const kit = {
			auth,
			...(config.access === undefined ? {} : { access }),
			db: opened.db,
			redis,
			ping: async (options?: { readonly timeoutMs?: number }) =>
				await probe(probes, options?.timeoutMs ?? 2_000),
			close,
			[Symbol.asyncDispose]: close,
		};
		return Object.freeze(kit) as unknown as KitOf<A, P, Db, Key>;
	} catch (error) {
		return await failStart(error);
	}
}

/**
 * The closes, in reverse of the opens — Redis before the database. `close`
 * is the kit's, idempotent, rejecting with the one failure or an
 * `AggregateError`; `failStart` closes on the way out of a failed start and
 * rethrows the error that stopped it.
 */
export function lifecycle() {
	const closers: Closers = [];
	/** Closes everything opened; answers what failed to close. */
	const closeAll = async () => {
		const failures: unknown[] = [];
		for (const closeOne of closers.splice(0).reverse()) {
			await closeOne().catch((error: unknown) => failures.push(error));
		}
		return failures;
	};
	let closing: Promise<void> | undefined;
	const close = () => {
		closing ??= closeAll().then((failures) => {
			if (failures.length === 1) throw failures[0];
			if (failures.length > 1) {
				throw new AggregateError(
					failures,
					'kit.close: several connections failed to close',
				);
			}
		});
		return closing;
	};
	const failStart = async (error: unknown): Promise<never> => {
		// The error that stopped the kit is the one to see; a failure to
		// close on the way out is only reported.
		for (const failure of await closeAll()) {
			process.emitWarning(
				`connectKit: a connection failed to close after the kit failed to start: ${String(failure)}`,
				{ code: 'JANUS_KIT_CLOSE_FAILED' },
			);
		}
		throw error;
	};
	return { closers, close, failStart };
}

async function openRedis(
	redis: RedisConfig | undefined,
	closers: Closers,
	label: string,
): Promise<RedisConnection | undefined> {
	if (redis === undefined) return undefined;
	if (redis.url === undefined) return redis.connection;
	const { connectRedis } = await import('@nxgt/redis');
	const connection = await connectRedis(redis.url, {
		enableOfflineQueue: false,
		...redis.clientOptions,
	}).catch((cause: unknown) => {
		// A refused configuration — this URL already connected with other
		// options — is not an outage: it passes through as it is.
		if (cause instanceof TypeError) throw cause;
		throw new Error(
			`connectKit: Redis did not answer. Check \`redis.url\`, or leave \`redis\` out to keep sessions in ${label}.`,
			{ cause },
		);
	});
	closers.push(() => connection.close());
	return connection;
}

/** `@nxgt/janus-telemetry`, an optional peer: loaded only when asked for. */
export async function loadTelemetry() {
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
