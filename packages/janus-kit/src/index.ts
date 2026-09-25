/**
 * `@nxgt/janus-kit` — `@nxgt/janus` wired in one call.
 *
 * `defineConfig` checks where PostgreSQL and Redis are, and holds the two
 * functions that build `auth` and `access`; `connectKit` opens the
 * connections, checks that Janus's tables are there, and answers
 * `{ auth, access, db, redis, ping, close }`. It defines **no error class**:
 * a refusal of the configuration is a `TypeError`, a database that cannot be
 * reached an `Error` with its `cause`.
 */

export {
	type AccessWiring,
	type Adapters,
	defineConfig,
	type KitConfig,
	type PostgresConfig,
	type RedisConfig,
} from './config';
export { connectKit, type Kit } from './connect';
export type { Health, PingResult } from './health';
