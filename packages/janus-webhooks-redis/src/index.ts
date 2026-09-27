/**
 * `@nxgt/janus-webhooks-redis` — the Redis queue for `@nxgt/janus-webhooks`,
 * on `@nxgt/redis`.
 *
 * Implements the `WebhookQueue` port: deliveries wait in Redis, shared by
 * every process of an application, so a retry waiting when one stops is sent
 * by the next. It defines **no error class**: every failure is
 * `@nxgt/janus`'s own `StoreFailure`.
 */

export {
	createRedisWebhookQueue,
	type RedisWebhookQueueOptions,
} from './queue';
