import type { PgDatabase } from '@nxgt/drizzle/pg';
import type { JanusTables } from '@nxgt/janus-drizzle';
import {
	checkObject,
	checkShared,
	type Database,
	nonEmpty,
	oneOf,
	type SharedConfig,
	type UncheckedShared,
} from '../shared/config';

/** PostgreSQL, as `ping` and the messages name it. */
export const postgresDatabase: Database<'postgres'> = {
	key: 'postgres',
	label: 'PostgreSQL',
};

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

/** The kit's configuration over PostgreSQL: `postgres`, then the shared keys. */
export interface KitConfig<A extends object, P extends object>
	extends SharedConfig<A, P> {
	readonly postgres: PostgresConfig;
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

/**
 * The checks, run by `defineConfig` and again by `connectKit`: a configuration
 * is often built in one file and connected in another, and one that skipped
 * `defineConfig` must not reach Bun's `SQL`, which reads `DATABASE_URL` for a
 * missing URL.
 */
export function checkConfig(
	config: UncheckedShared & { readonly postgres: PostgresConfig },
	where: string,
): void {
	checkObject(config, where);
	const { postgres } = config;
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
	checkShared(config, where, postgresDatabase);
}
