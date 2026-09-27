import { afterAll, beforeAll, describe, it } from 'bun:test';
import type { WebhookQueue } from '@nxgt/janus-webhooks';
import { describeWebhookQueues } from '@nxgt/janus-webhooks/conformance';
import { openCase } from '../test/case';
import { startRedis, type TestServer } from '../test/server';
import { createRedisWebhookQueue } from './queue';

/**
 * The whole suite against a real Redis, outages included.
 *
 * **Each method runs as a Redis user of its own**, allowed only the keys of
 * the case's prefix: the queue a case gets is six queues over one prefix,
 * each method taken from the one whose connection is that user's. **The
 * faults are the server's**: Redis refuses the method's user with `NOPERM`,
 * and the insert's half-way through its script — what is proven is what the
 * adapter does with a real server error, not with a wrapper that throws.
 */

let server: TestServer;

// A cold checkout compiles Redis first: about two minutes.
beforeAll(async () => {
	server = await startRedis();
}, 300_000);

afterAll(async () => {
	await server.stop();
});

describeWebhookQueues({
	name: '@nxgt/janus-webhooks-redis',
	runner: { describe, it },
	faults: true,
	harness: {
		async open() {
			const test = await openCase(server);
			const { prefix, connections } = test;
			const over = (method: keyof WebhookQueue) =>
				createRedisWebhookQueue(connections[method], { prefix });
			const queue: WebhookQueue = {
				insertDeliveries: over('insertDeliveries').insertDeliveries,
				claimDeliveries: over('claimDeliveries').claimDeliveries,
				claimOrphanedDeliveries: over('claimOrphanedDeliveries')
					.claimOrphanedDeliveries,
				extendLease: over('extendLease').extendLease,
				scheduleRetry: over('scheduleRetry').scheduleRetry,
				deleteDelivery: over('deleteDelivery').deleteDelivery,
			};
			return { queue, faults: { fail: test.fail }, close: test.close };
		},
	},
});
