import { describe, expect, it } from 'bun:test';
import type { UserEvent } from '@nxgt/janus';
import { webhooks } from './deliver';
import { endpoint, event, secret, url } from './deliver.fixtures';
import { verifyWebhook } from './payload';
import { createMemoryWebhookQueue } from './queue/memory';
import type { WebhookQueue } from './queue/types';

// The new-device event of @nxgt/janus: posted like the others, and the
// session it names never past the listener.

const newDevice: UserEvent = Object.freeze({
	...event,
	type: 'user.newDeviceSignedIn',
	sessionId: '0190e3b4-0000-7000-8000-0000000000aa',
});

describe('webhooks, on a sign-in from a new device', () => {
	it('posts user.newDeviceSignedIn, which verifyWebhook reads back', async () => {
		const { sent, fetch } = endpoint(204);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			fetch,
		});

		listener(newDevice);
		await listener.close();

		const read = verifyWebhook({
			secrets: [secret],
			headers: sent[0]?.init.headers as Record<string, string>,
			body: String(sent[0]?.init.body),
		});
		expect(read?.type).toBe('user.newDeviceSignedIn');
	});

	it('posts no session id: the body names the user by id alone', async () => {
		const { sent, fetch } = endpoint(204);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			fetch,
		});

		listener(newDevice);
		await listener.close();

		expect(JSON.parse(String(sent[0]?.init.body))).toEqual({
			type: 'user.newDeviceSignedIn',
			timestamp: event.occurredAt.toISOString(),
			data: { userId: event.userId, userType: event.userType },
		});
	});

	it('hands a queue of yours no session id either', async () => {
		const memory = createMemoryWebhookQueue();
		const inserted: UserEvent[] = [];
		const queue: WebhookQueue = {
			...memory,
			insertDeliveries(given, to, at) {
				inserted.push(given);
				return memory.insertDeliveries(given, to, at);
			},
		};
		const listener = webhooks({
			endpoints: [{ id: 'crm', url, secrets: [secret] }],
			queue,
			fetch: endpoint(204).fetch,
		});

		await listener(newDevice);
		await listener.close();

		expect(inserted).toHaveLength(1);
		expect(inserted[0]).not.toHaveProperty('sessionId');
	});
});
