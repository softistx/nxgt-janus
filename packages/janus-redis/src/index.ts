/**
 * `@nxgt/janus-redis` — the Redis adapter for `@nxgt/janus`, on
 * `@nxgt/redis`.
 *
 * Implements the `sessions` and `tokens` slots of the `@nxgt/janus` store
 * port: the two read on every request, and ephemeral by construction, so
 * Redis expires them itself. Users stay in another adapter. It defines **no
 * error class**: every failure is `@nxgt/janus`'s own `StoreFailure`.
 */

export {
	createRedisStores,
	type RedisStores,
	type RedisStoresOptions,
} from './stores';
