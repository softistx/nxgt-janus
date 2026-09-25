/**
 * `@nxgt/janus-kit/mongo` — `@nxgt/janus` wired in one call, over MongoDB
 * through `@nxgt/janus-mongo`.
 *
 * `defineConfig` checks where MongoDB and Redis are, and holds the two
 * functions that build `auth` and `access`; `connectKit` opens the
 * connections, checks that Janus's collections are in sync, and answers
 * `{ auth, access, db, redis, ping, close }`. It defines **no error class**:
 * a refusal of the configuration is a `TypeError`, a database that cannot be
 * reached an `Error` with its `cause`.
 */

export type {
	AccessWiring,
	Adapters,
	RedisConfig,
} from '../shared/config';
export type { PingResult } from '../shared/health';
export { defineConfig, type KitConfig, type MongoConfig } from './config';
export { connectKit, type Health, type Kit } from './connect';
