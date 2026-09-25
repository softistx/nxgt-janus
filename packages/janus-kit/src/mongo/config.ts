import type { Db, MongoClientOptions } from 'mongodb';
import {
	checkObject,
	checkShared,
	type Database,
	nonEmpty,
	oneOf,
	type SharedConfig,
	type UncheckedShared,
} from '../shared/config';

/** MongoDB, as `ping` and the messages name it. */
export const mongoDatabase: Database<'mongo'> = {
	key: 'mongo',
	label: 'MongoDB',
};

/**
 * Where users, relations — and sessions and tokens, unless Redis holds them —
 * are kept. **The URL of a database of Janus's own**, its path naming the
 * database, which the kit opens with `@nxgt/mongo`'s `connectMongo` and
 * closes; or a `Db` you opened, which it never closes.
 */
export type MongoConfig =
	| {
			readonly url: string;
			readonly db?: never;
			/** The driver's options, over the kit's `{ serverSelectionTimeoutMS: 5_000 }`. */
			readonly clientOptions?: MongoClientOptions;
	  }
	| {
			readonly db: Db;
			readonly url?: never;
			readonly clientOptions?: never;
	  };

/** The kit's configuration over MongoDB: `mongo`, then the shared keys. */
export interface KitConfig<A extends object, P extends object>
	extends SharedConfig<A, P> {
	readonly mongo: MongoConfig;
}

/**
 * The configuration, **checked once, where the application starts**. It
 * connects to nothing and reads no environment variable.
 *
 * ```ts
 * export const config = defineConfig({
 *   mongo: { url: process.env.JANUS_MONGO_URL! },
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
 * is often built in one file and connected in another.
 */
export function checkConfig(
	config: UncheckedShared & { readonly mongo: MongoConfig },
	where: string,
): void {
	checkObject(config, where);
	const { mongo } = config;
	if (typeof mongo !== 'object' || mongo === null) {
		throw new TypeError(
			`${where}: \`mongo\` is required — { url } of Janus's database, or { db }, a Db you opened.`,
		);
	}
	oneOf(where, 'mongo', mongo, 'url', 'db');
	if (mongo.url !== undefined) {
		nonEmpty(where, 'mongo.url', mongo.url);
		// Only the scheme is named: the URL may hold a password.
		const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(mongo.url)?.[1];
		if (scheme !== 'mongodb' && scheme !== 'mongodb+srv') {
			throw new TypeError(
				`${where}: \`mongo.url\` is a mongodb:// or mongodb+srv:// URL${scheme === undefined ? '' : `, not ${scheme}://`}.`,
			);
		}
	}
	if (mongo.db !== undefined && mongo.clientOptions !== undefined) {
		throw new TypeError(
			`${where}: \`mongo.clientOptions\` beside \`mongo.db\` — its client is already open with its own. Pass the options where you opened it.`,
		);
	}
	checkShared(config, where, mongoDatabase);
}
