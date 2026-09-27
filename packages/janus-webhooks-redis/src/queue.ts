import { randomUUID } from 'node:crypto';
import { StoreFailure } from '@nxgt/janus';
import type { WebhookQueue } from '@nxgt/janus-webhooks';
import type { RedisConnection } from '@nxgt/redis';
import type { RedisClient } from 'bun';
import {
	limitOf,
	type Method,
	stampOf,
	statusOf,
	toCount,
	toDeliveries,
	toHeld,
} from './replies';
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
	/**
	 * Runs `operation`'s script over the arguments `argsOf` builds — which
	 * refuses, before any I/O, what the script would store and no claim could
	 * read back — and decodes its reply.
	 */
	const run = async <T>(
		operation: Method,
		script: string,
		argsOf: (operation: Method) => readonly string[],
		decode: (reply: unknown, operation: Method) => T,
	): Promise<T> => {
		const args = argsOf(operation);
		return decode(
			await evaluate(operation, script, [prefix, ...args]),
			operation,
		);
	};

	return {
		insertDeliveries: (event, endpoints, dueAt) =>
			run(
				'insertDeliveries',
				INSERT_DELIVERIES,
				(operation) => [
					event.id,
					event.type,
					stampOf(event.occurredAt, operation, 'event.occurredAt'),
					event.userId,
					event.userType,
					stampOf(dueAt, operation, 'dueAt'),
					...endpoints,
				],
				toCount,
			),

		// A lease per claim, minted here: every write after it names it.
		claimDeliveries: (endpoints, now, leaseUntil, limit) =>
			run(
				'claimDeliveries',
				CLAIM_DELIVERIES,
				(operation) => [
					stampOf(now, operation, 'now'),
					stampOf(leaseUntil, operation, 'leaseUntil'),
					limitOf(limit, operation),
					randomUUID(),
					...endpoints,
				],
				toDeliveries,
			),

		claimOrphanedDeliveries: (known, dueBefore, leaseUntil, limit) =>
			run(
				'claimOrphanedDeliveries',
				CLAIM_ORPHANED_DELIVERIES,
				(operation) => [
					stampOf(dueBefore, operation, 'dueBefore'),
					stampOf(leaseUntil, operation, 'leaseUntil'),
					limitOf(limit, operation),
					randomUUID(),
					...known,
				],
				toDeliveries,
			),

		extendLease: (id, lease, until) =>
			run(
				'extendLease',
				EXTEND_LEASE,
				(operation) => [id, lease, stampOf(until, operation, 'until')],
				toHeld,
			),

		scheduleRetry: (id, lease, dueAt, failed) =>
			run(
				'scheduleRetry',
				SCHEDULE_RETRY,
				(operation) => [
					id,
					lease,
					stampOf(dueAt, operation, 'dueAt'),
					statusOf(failed.status, operation),
					failed.error ?? '',
				],
				toHeld,
			),

		deleteDelivery: (id, lease) =>
			run('deleteDelivery', DELETE_DELIVERY, () => [id, lease], toHeld),
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
