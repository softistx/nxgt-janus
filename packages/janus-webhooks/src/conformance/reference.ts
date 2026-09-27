import { StoreFailure } from '@nxgt/janus';
import { createMemoryWebhookQueue } from '../queue/memory';
import type { WebhookQueue, WebhookQueueMethod } from '../queue/types';
import type { WebhookQueueHarness } from './types';

/**
 * The harness for the reference queue: what `self.spec.ts` runs the suite
 * against, and **the example an adapter author copies**.
 *
 * Its faults are a wrapper, because an in-memory map has no network to cut —
 * which is exactly what `WebhookQueueFaults` tells an adapter not to do: a
 * wrapper proves the wrapper. For the reference queue there is nothing
 * underneath to prove, and it fails the way a correct adapter does, with
 * `StoreFailure`.
 */
export function referenceWebhookQueueHarness(): WebhookQueueHarness {
	return {
		async open() {
			const failing = new Set<WebhookQueueMethod>();
			const inner = createMemoryWebhookQueue();
			/** The failure of `method`, when it is made to fail; `null` otherwise. */
			const fault = (method: WebhookQueueMethod) =>
				failing.has(method)
					? Promise.reject(
							new StoreFailure(
								`webhookQueue.${method}: the queue could not answer`,
								{ operation: method },
							),
						)
					: null;
			const queue: WebhookQueue = {
				insertDeliveries: (...args) =>
					fault('insertDeliveries') ?? inner.insertDeliveries(...args),
				claimDeliveries: (...args) =>
					fault('claimDeliveries') ?? inner.claimDeliveries(...args),
				claimOrphanedDeliveries: (...args) =>
					fault('claimOrphanedDeliveries') ??
					inner.claimOrphanedDeliveries(...args),
				extendLease: (...args) =>
					fault('extendLease') ?? inner.extendLease(...args),
				scheduleRetry: (...args) =>
					fault('scheduleRetry') ?? inner.scheduleRetry(...args),
				deleteDelivery: (...args) =>
					fault('deleteDelivery') ?? inner.deleteDelivery(...args),
			};

			return {
				queue,
				faults: {
					async fail(method: WebhookQueueMethod) {
						failing.add(method);
					},
				},
			};
		},
	};
}
