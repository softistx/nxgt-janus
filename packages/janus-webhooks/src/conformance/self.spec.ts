import { describe, expect, it } from 'bun:test';
import { StoreFailure } from '@nxgt/janus';
import { createMemoryWebhookQueue } from '../queue/memory';
import { QUEUE_METHODS, type WebhookQueue } from '../queue/types';
import { allWebhookQueueCases } from './cases';
import { describeWebhookQueues, runWebhookQueueCase } from './describe';
import { referenceWebhookQueueHarness } from './reference';

// The suite proved against the reference queue, outages included, before any
// adapter runs it.
describeWebhookQueues({
	name: 'the reference queue',
	harness: referenceWebhookQueueHarness(),
	runner: { describe, it },
});

/** The case of that id, or a failure: a renamed case must fail here, loudly. */
function caseOf(id: string) {
	const found = allWebhookQueueCases.find((one) => one.id === id);
	if (found === undefined) throw new Error(`no ${id} case`);
	return found;
}

/** A harness opening `queue` as it stands, with faults that do nothing. */
const harnessOf = (queue: WebhookQueue) => ({
	open: async () => ({ queue, faults: { async fail() {} } }),
});

describe('the queue suite itself', () => {
	it('covers every method of the port with an outage case', () => {
		expect(
			allWebhookQueueCases
				.filter((one) => one.group === 'outage')
				.map((one) => one.id),
		).toEqual(QUEUE_METHODS.map((method) => `outage.${method}`));
	});

	it('gives every case a unique id', () => {
		const ids = allWebhookQueueCases.map((one) => one.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('fails a queue whose claim reads, then writes after an await: two claims answer one delivery', async () => {
		const inner = createMemoryWebhookQueue();
		const racy: WebhookQueue = {
			...inner,
			// Reads what is due, and answers it after an await, hiding nothing
			// in between: the gap of every adapter that is not atomic.
			claimDeliveries: async (endpoints, now, _leaseUntil, limit) => {
				const seen = await inner.claimDeliveries(endpoints, now, now, limit);
				await new Promise((resolve) => setTimeout(resolve, 1));
				return seen;
			},
		};

		await expect(
			runWebhookQueueCase(caseOf('lease.concurrentClaims'), harnessOf(racy)),
		).rejects.toThrow('a claim is atomic');
	});

	it('fails a queue that answers [] for an outage', async () => {
		const inner = createMemoryWebhookQueue();
		let failing = false;
		const swallowing: WebhookQueue = {
			...inner,
			claimDeliveries: async (...args) => {
				if (failing) return []; // catch { return [] }: the trap
				return inner.claimDeliveries(...args);
			},
		};

		await expect(
			runWebhookQueueCase(caseOf('outage.claimDeliveries'), {
				open: async () => ({
					queue: swallowing,
					faults: {
						async fail() {
							failing = true;
						},
					},
				}),
			}),
		).rejects.toThrow('claimDeliveries under an outage should reject');
	});

	it('fails a queue whose stale lease still deletes', async () => {
		const inner = createMemoryWebhookQueue();
		const careless: WebhookQueue = {
			...inner,
			// Checks the id, not the lease.
			deleteDelivery: async () => true,
		};

		await expect(
			runWebhookQueueCase(caseOf('lease.staleLease'), harnessOf(careless)),
		).rejects.toThrow('deleteDelivery with a lease taken over');
	});

	it('fails a queue that throws a StoreFailure of another copy of @nxgt/janus', async () => {
		const inner = createMemoryWebhookQueue();
		let failing = false;
		class Impostor extends Error {
			override name = 'StoreFailure';
		}
		const duplicated: WebhookQueue = {
			...inner,
			deleteDelivery: async (...args) => {
				if (failing) throw new Impostor('down');
				return inner.deleteDelivery(...args);
			},
		};

		await expect(
			runWebhookQueueCase(caseOf('outage.deleteDelivery'), {
				open: async () => ({
					queue: duplicated,
					faults: {
						async fail() {
							failing = true;
						},
					},
				}),
			}),
		).rejects.toThrow('two copies of @nxgt/janus are installed');
	});

	it("passes a queue that throws @nxgt/janus's StoreFailure", async () => {
		expect(
			await runWebhookQueueCase(
				caseOf('outage.extendLease'),
				referenceWebhookQueueHarness(),
			),
		).toEqual({ passed: true });
		expect(new StoreFailure('x')).toBeInstanceOf(Error);
	});

	it('reports a run without faults, never passes over it', async () => {
		expect(
			await runWebhookQueueCase(caseOf('outage.claimDeliveries'), {
				open: async () => ({ queue: createMemoryWebhookQueue() }),
			}),
		).toEqual({ skipped: expect.stringContaining('faults not provided') });
	});
});
