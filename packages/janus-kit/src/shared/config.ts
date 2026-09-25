import type { JanusStores } from '@nxgt/janus';
import type { RelationStore } from '@nxgt/janus/permissions';
import type { RedisConnection } from '@nxgt/redis';
import type { RedisOptions } from 'bun';

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
	/** Users from the database; sessions and tokens from Redis when it is wired. */
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
 * The keys every kit shares, whatever the database. **`auth` and `access`
 * are yours to write**, so `janus()` and `defineModel()` infer every type
 * where you call them; the kit hands them the stores.
 */
export interface SharedConfig<A extends object, P extends object> {
	readonly redis?: RedisConfig;
	/**
	 * `true` wraps `auth` and `access` with `@nxgt/janus-telemetry`'s
	 * `instrumentJanus` and `instrumentPermissions`, an optional peer.
	 */
	readonly telemetry?: boolean;
	readonly auth: (adapters: Adapters) => A;
	readonly access?: (wiring: AccessWiring<A>) => P;
}

/** What the checks read: every shared key, whatever `auth` and `access` build. */
export interface UncheckedShared {
	readonly redis?: RedisConfig | undefined;
	readonly telemetry?: boolean | undefined;
	readonly auth: unknown;
	readonly access?: unknown;
}

/**
 * The shared keys' checks, after the database's own. `database` is where
 * sessions stay without Redis — `PostgreSQL`, `MongoDB` — as a message
 * names it.
 */
export function checkShared(
	config: UncheckedShared,
	where: string,
	database: string,
): void {
	const { redis, telemetry, auth, access } = config;
	if (redis !== undefined) {
		if (typeof redis !== 'object' || redis === null) {
			throw new TypeError(
				`${where}: \`redis\` is { url } or { connection }, or absent to keep sessions in ${database}.`,
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

/** Refuses a configuration that is not an object at all. */
export function checkObject(config: unknown, where: string): void {
	if (typeof config !== 'object' || config === null) {
		throw new TypeError(`${where}: pass the kit's configuration, an object.`);
	}
}

/** Exactly one of `first` and `second`. */
export function oneOf(
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

export function nonEmpty(where: string, name: string, value: unknown): void {
	if (typeof value !== 'string' || value === '') {
		throw new TypeError(`${where}: \`${name}\` is a non-empty string.`);
	}
}
