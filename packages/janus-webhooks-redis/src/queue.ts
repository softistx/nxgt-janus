import { randomUUID } from 'node:crypto';
import { StoreFailure } from '@nxgt/janus';
import type { WebhookQueue } from '@nxgt/janus-webhooks';
import type { RedisConnection } from '@nxgt/redis';
import type { RedisClient } from 'bun';
import { type Method, stamp, toCount, toDeliveries, toHeld } from './replies';
import {
	CLAIM_DELIVERIES,
	CLAIM_ORPHANED_DELIVERIES,
	DELETE_DELIVERY,
	EXTEND_LEASE,
	INSERT_DELIVERIES,
	SCHEDULE_RETRY,
} from './scripts';

/** What the queue takes besides the connection. */
export interface RedisWebhookQueueOptions {
	/**
	 * What every key starts with — `janus:webhooks:` unless you say
	 * otherwise. Every process that shares deliveries passes the same one;
	 * two applications sharing one Redis each take their own.
	 */
	readonly prefix?: string;
}

/**
 * The durable queue of `@nxgt/janus-webhooks`, over one Redis, on
 * `@nxgt/redis`'s connection: deliveries wait in Redis, so a retry waiting
 * when a process stops is sent by the next one.
 *
 * ```ts
 * const redis = await connectRedis(process.env.REDIS_URL);
 * const listener = webhooks({ endpoints, queue: createRedisWebhookQueue(redis) });
 * ```
 *
 * **Every method is one Lua script**, atomic as the port asks: two claims
 * running at once — in one process or in twenty — never answer one
 * delivery. Every time is the caller's, never Redis's clock.
 *
 * It creates nothing and needs no schema: the keys are made by the first
 * insert, and a delivery's keys go with its delete.
 */
export function createRedisWebhookQueue(
	redis: RedisConnection,
	options: RedisWebhookQueueOptions = {},
): WebhookQueue {
	const prefix = options.prefix ?? 'janus:webhooks:';
	const evaluate = scriptsOver(redis.client);
	const run = <T>(
		operation: Method,
		script: string,
		args: readonly string[],
		decode: (reply: unknown, operation: Method) => T,
	): Promise<T> =>
		evaluate(operation, script, [prefix, ...args]).then((reply) =>
			decode(reply, operation),
		);

	return {
		insertDeliveries: (event, endpoints, dueAt) =>
			run(
				'insertDeliveries',
				INSERT_DELIVERIES,
				[
					event.id,
					event.type,
					stamp(event.occurredAt),
					event.userId,
					event.userType,
					stamp(dueAt),
					...endpoints,
				],
				toCount,
			),

		// A lease per claim, minted here: every write after it names it.
		claimDeliveries: (endpoints, now, leaseUntil, limit) =>
			run(
				'claimDeliveries',
				CLAIM_DELIVERIES,
				[
					stamp(now),
					stamp(leaseUntil),
					String(limit),
					randomUUID(),
					...endpoints,
				],
				toDeliveries,
			),

		claimOrphanedDeliveries: (known, dueBefore, leaseUntil, limit) =>
			run(
				'claimOrphanedDeliveries',
				CLAIM_ORPHANED_DELIVERIES,
				[
					stamp(dueBefore),
					stamp(leaseUntil),
					String(limit),
					randomUUID(),
					...known,
				],
				toDeliveries,
			),

		extendLease: (id, lease, until) =>
			run('extendLease', EXTEND_LEASE, [id, lease, stamp(until)], toHeld),

		scheduleRetry: (id, lease, dueAt, failed) =>
			run(
				'scheduleRetry',
				SCHEDULE_RETRY,
				[
					id,
					lease,
					stamp(dueAt),
					failed.status === null ? '' : String(failed.status),
					failed.error ?? '',
				],
				toHeld,
			),

		deleteDelivery: (id, lease) =>
			run('deleteDelivery', DELETE_DELIVERY, [id, lease], toHeld),
	};
}

/** Runs a script, and makes every rejection one the port allows. */
type Evaluate = (
	operation: Method,
	script: string,
	args: readonly string[],
) => Promise<unknown>;

/**
 * Each script is sent once by its SHA — `EVALSHA` — and in full only when
 * Redis answers `NOSCRIPT`: after a restart, a failover, or a `SCRIPT FLUSH`.
 * Every other error is a failure, and nothing is ever answered as an absence.
 */
function scriptsOver(client: RedisClient): Evaluate {
	const shas = new Map<string, string>();
	const shaOf = (script: string) => {
		let sha = shas.get(script);
		if (sha === undefined) {
			sha = new Bun.CryptoHasher('sha1').update(script).digest('hex');
			shas.set(script, sha);
		}
		return sha;
	};

	return async (operation, script, args) => {
		try {
			try {
				return await client.send('EVALSHA', [shaOf(script), '0', ...args]);
			} catch (error) {
				if (!isNoScript(error)) throw error;
				return await client.send('EVAL', [script, '0', ...args]);
			}
		} catch (error) {
			throw new StoreFailure(
				`webhookQueue.${operation}: the queue could not answer`,
				{ operation, cause: error },
			);
		}
	};
}

function isNoScript(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith('NOSCRIPT');
}
