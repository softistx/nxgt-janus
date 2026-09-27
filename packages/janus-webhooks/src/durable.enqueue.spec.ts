import { describe, expect, it } from 'bun:test';
import {
	createMemoryStores,
	janus,
	StoreFailure,
	scryptHasher,
	type UserEvent,
} from '@nxgt/janus';
import { z } from 'zod';
import { webhooks } from './deliver';
import {
	endpoint,
	endpoints,
	eventOf,
	held,
	pause,
	secret,
	until,
	url,
	waitingIn,
} from './durable.fixtures';
import { createMemoryWebhookQueue } from './queue/memory';
import type { WebhookQueue } from './queue/types';

// How the listener puts deliveries in a queue, and sends them from it.

describe('webhooks({ queue })', () => {
	it('resolves the listener once the deliveries are in the queue, and sends at once', async () => {
		const queue = createMemoryWebhookQueue();
		const { sent, fetch } = endpoint(204);
		const listener = webhooks({ endpoints, queue, fetch });

		const inserted = listener(eventOf());
		expect(inserted).toBeInstanceOf(Promise);
		await inserted;
		await until(() => sent.length === 1);
		await listener.close();

		expect(await waitingIn(queue, ['crm'])).toEqual([]);
	});

	it('rejects the listener when the insert fails, and janus warns with the event id', async () => {
		const queue: WebhookQueue = {
			...createMemoryWebhookQueue(),
			insertDeliveries: async () => {
				throw new StoreFailure('webhookQueue.insertDeliveries: down');
			},
		};
		const listener = webhooks({ endpoints, queue, fetch: endpoint().fetch });

		const refused = await (listener(eventOf()) as Promise<void>).then(
			() => null,
			(failure: unknown) => failure,
		);
		expect(refused).toBeInstanceOf(StoreFailure);

		const warnings: Error[] = [];
		const onWarning = (warning: Error) => warnings.push(warning);
		process.on('warning', onWarning);
		try {
			const auth = janus({
				user: z.strictObject({ email: z.email() }),
				password: { login: 'email' },
				store: createMemoryStores(),
				hasher: scryptHasher(),
				events: listener,
			});
			const user = await auth.create({ email: 'ada@example.test' });
			await until(() => warnings.length === 1);
			expect((warnings[0] as Error & { code?: string }).code).toBe(
				'JANUS_EVENT_FAILED',
			);
			expect(user.email).toBe('ada@example.test');
		} finally {
			process.off('warning', onWarning);
		}
		await listener.close();
	});

	it('holds only the endpoint id: never the URL, never a secret', async () => {
		const inserts: unknown[][] = [];
		const memory = createMemoryWebhookQueue();
		const queue: WebhookQueue = {
			...memory,
			insertDeliveries: (...args) => {
				inserts.push(args);
				return memory.insertDeliveries(...args);
			},
		};
		const { sent, fetch } = endpoint(200);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			queue,
			fetch,
		});

		await listener(eventOf());
		await until(() => sent.length === 1);
		await listener.close();

		const [, ids] = inserts[0] as [UserEvent, string[]];
		expect(ids).toHaveLength(1);
		expect(ids[0]).toMatch(/^[0-9a-f]{32}$/);
		expect(JSON.stringify(inserts)).not.toContain('sentinel');
		expect(JSON.stringify(inserts)).not.toContain(secret.slice(6));
	});

	it('sends no more than concurrency requests at once', async () => {
		const queue = createMemoryWebhookQueue();
		const { answers, fetch } = held();
		const listener = webhooks({ endpoints, queue, concurrency: 2, fetch });

		for (let n = 0; n < 5; n += 1) await listener(eventOf());
		await pause(20);
		expect(answers).toHaveLength(2);

		for (let sent = 0; sent < 5; sent += 1) {
			await until(() => answers.length > sent);
			answers[sent]?.(200);
		}
		await until(() => answers.length === 5);
		await listener.close();
		expect(await waitingIn(queue, ['crm'])).toEqual([]);
	});
});
