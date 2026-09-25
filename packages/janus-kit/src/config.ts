import type { PgDatabase } from '@nxgt/drizzle/pg';
import type { JanusStores } from '@nxgt/janus';
import type { RelationStore } from '@nxgt/janus/permissions';
import type { JanusTables } from '@nxgt/janus-drizzle';
import type { RedisConnection } from '@nxgt/redis';
import type { RedisOptions } from 'bun';

/**
 * Where users, logins, relations — and sessions and tokens, unless Redis
 * holds them — are kept. **The URL of a database of Janus's own**, which the
 * kit opens over Bun's `SQL` and closes; or a Drizzle instance you opened,
 * which it never closes.
 */
export type PostgresConfig =
	| {
			readonly url: string;
			readonly db?: never;
			/** What your schema file exports, when the tables are in a PostgreSQL schema of their own. */
			readonly tables?: JanusTables;
	  }
	| {
			readonly db: PgDatabase;
			readonly url?: never;
			readonly tables?: JanusTables;
	  };

/**
 * Where sessions and one-time tokens are kept instead. The URL, which the kit
 * connects to with `enableOfflineQueue: false` unless `clientOptions` says
 * otherwise, and closes; or a connection you opened, which it never closes.
 */
export type RedisConfig =
	| {
			readonly url: string;
			readonly connection?: never;
			/** Bun's `RedisOptions`, over the kit's `{ enableOfflineQueue: false }`. */
			readonly clientOptions?: RedisOptions;
			/** What every key starts with: `janus:` by default. */
			readonly prefix?: string;
	  }
	| {
			readonly connection: RedisConnection;
			readonly url?: never;
			readonly clientOptions?: never;
			readonly prefix?: string;
	  };

/** What `auth` is built from: spread it into `janus()`. */
export interface Adapters {
	/** Users from PostgreSQL; sessions and tokens from Redis when it is wired. */
	readonly store: JanusStores;
	/** The relation store: deleting a user deletes every tuple naming them. */
	readonly relations: RelationStore;
}

/** What `access` is built from. */
export interface AccessWiring<A> {
	readonly relations: RelationStore;
	/** The instance `auth` returned: its `types` are the model's subjects. */
	readonly auth: A;
}

/**
 * The kit's configuration. **`auth` and `access` are yours to write**, so
 * `janus()` and `defineModel()` infer every type where you call them; the kit
 * hands them the stores.
 */
export interface KitConfig<A extends object, P extends object> {
	readonly postgres: PostgresConfig;
	readonly redis?: RedisConfig;
	/**
	 * `true` wraps `auth` and `access` with `@nxgt/janus-telemetry`'s
	 * `instrumentJanus` and `instrumentPermissions`, an optional peer.
	 */
	readonly telemetry?: boolean;
	readonly auth: (adapters: Adapters) => A;
	readonly access?: (wiring: AccessWiring<A>) => P;
}

/**
 * The configuration, **checked once, where the application starts**. It
 * connects to nothing and reads no environment variable: write
 * `process.env.JANUS_DATABASE_URL!` where your other settings are read.
 *
 * ```ts
 * export const config = defineConfig({
 *   postgres: { url: process.env.JANUS_DATABASE_URL! },
 *   redis: { url: process.env.REDIS_URL! },
 *   auth: (adapters) => janus({ user, password: { login: 'email' }, hasher: scryptHasher(), ...adapters }),
 * });
 * ```
 */
export function defineConfig<A extends object, P extends object = never>(
	config: KitConfig<A, P>,
): KitConfig<A, P> {
	checkConfig(config, 'defineConfig');
	return Object.freeze({ ...config });
}

/** What the checks read: every key, whatever `auth` and `access` build. */
interface Unchecked {
	readonly postgres: PostgresConfig;
	readonly redis?: RedisConfig | undefined;
	readonly telemetry?: boolean | undefined;
	readonly auth: unknown;
	readonly access?: unknown;
}

/**
 * The checks, run by `defineConfig` and again by `connectKit`: a configuration
 * is often built in one file and connected in another, and one that skipped
 * `defineConfig` must not reach Bun's `SQL`, which reads `DATABASE_URL` for a
 * missing URL.
 */
export function checkConfig(config: Unchecked, where: string): void {
	if (typeof config !== 'object' || config === null) {
		throw new TypeError(`${where}: pass the kit's configuration, an object.`);
	}
	const { postgres, redis, telemetry, auth, access } = config;
	if (typeof postgres !== 'object' || postgres === null) {
		throw new TypeError(
			`${where}: \`postgres\` is required — { url } of Janus's database, or { db }, a Drizzle instance you opened.`,
		);
	}
	oneOf(where, 'postgres', postgres, 'url', 'db');
	if (postgres.url !== undefined) {
		nonEmpty(where, 'postgres.url', postgres.url);
		// Bun's `SQL` picks its driver from the scheme: `mysql://` and
		// `sqlite://` open another database. Only the scheme is named: the
		// URL may hold a password.
		const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(postgres.url)?.[1];
		if (scheme !== 'postgres' && scheme !== 'postgresql') {
			throw new TypeError(
				`${where}: \`postgres.url\` is a postgres:// or postgresql:// URL${scheme === undefined ? '' : `, not ${scheme}://`}.`,
			);
		}
	}
	if (redis !== undefined) {
		if (typeof redis !== 'object' || redis === null) {
			throw new TypeError(
				`${where}: \`redis\` is { url } or { connection }, or absent to keep sessions in PostgreSQL.`,
			);
		}
		oneOf(where, 'redis', redis, 'url', 'connection');
		if (redis.url !== undefined) nonEmpty(where, 'redis.url', redis.url);
		if (redis.connection !== undefined && redis.clientOptions !== undefined) {
			throw new TypeError(
				`${where}: \`redis.clientOptions\` beside \`redis.connection\` — the connection is already open with its own. Pass the options where you opened it.`,
			);
		}
		if (redis.prefix !== undefined) {
			nonEmpty(where, 'redis.prefix', redis.prefix);
		}
	}
	if (telemetry !== undefined && typeof telemetry !== 'boolean') {
		throw new TypeError(`${where}: \`telemetry\` is true or false.`);
	}
	if (typeof auth !== 'function') {
		throw new TypeError(
			`${where}: \`auth\` is required — (adapters) => janus({ …, ...adapters }).`,
		);
	}
	if (access !== undefined && typeof access !== 'function') {
		throw new TypeError(
			`${where}: \`access\` is ({ relations, auth }) => permissions({ model, store: relations }).`,
		);
	}
}

function oneOf(
	where: string,
	name: string,
	value: object,
	first: string,
	second: string,
): void {
	const has = (key: string) =>
		(value as Record<string, unknown>)[key] !== undefined;
	if (has(first) === has(second)) {
		throw new TypeError(
			has(first)
				? `${where}: \`${name}\` has both ${first} and ${second}. Pass one.`
				: `${where}: \`${name}\` needs ${first} or ${second}.`,
		);
	}
}

function nonEmpty(where: string, name: string, value: unknown): void {
	if (typeof value !== 'string' || value === '') {
		throw new TypeError(`${where}: \`${name}\` is a non-empty string.`);
	}
}
