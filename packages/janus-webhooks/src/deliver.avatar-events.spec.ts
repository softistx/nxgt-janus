import { describe, expect, it } from 'bun:test';
import type { UserEvent } from '@nxgt/janus';
import { webhooks } from './deliver';
import {
	endpoint,
	event,
	givingUps,
	secret,
	until,
	url,
} from './deliver.fixtures';
import { verifyWebhook } from './payload';
import { createMemoryWebhookQueue } from './queue/memory';
import type { WebhookQueue } from './queue/types';

// The avatar events of @nxgt/janus: posted like the others, and the former
// image they name never past the listener.

const changed: UserEvent = Object.freeze({
	...event,
	type: 'user.avatarChanged',
	formerAvatarId: 'former-image',
});
const removed: UserEvent = Object.freeze({
	...event,
	type: 'user.avatarRemoved',
	formerAvatarId: 'former-image',
});

describe('webhooks, on an avatar change', () => {
	it.each([changed, removed])(
		'posts $type, which verifyWebhook reads back, without the former id',
		async (given) => {
			const { sent, fetch } = endpoint(204);
			const listener = webhooks({
				endpoints: [{ url, secrets: [secret] }],
				fetch,
			});

			listener(given);
			await listener.close();

			const body = String(sent[0]?.init.body);
			expect(JSON.parse(body)).toEqual({
				type: given.type,
				timestamp: event.occurredAt.toISOString(),
				data: { userId: event.userId, userType: event.userType },
			});
			expect(body).not.toContain('former-image');
			const headers = sent[0]?.init.headers;
			const read = verifyWebhook({
				secrets: [secret],
				headers: Object.fromEntries(new Headers(headers).entries()),
				body,
			});
			expect(read?.type).toBe(given.type);
		},
	);

	it('hands a queue of yours no formerAvatarId either', async () => {
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

		await listener(changed);
		await listener.close();

		expect(inserted).toHaveLength(1);
		expect(inserted[0]).not.toHaveProperty('formerAvatarId');
	});

	it('reports a delivery given up with no formerAvatarId', async () => {
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			fetch: endpoint(204).fetch,
			onGivingUp,
		});
		await listener.close();

		listener(changed); // closed, with no queue: given up at once
		await until(() => given.length > 0);

		expect(given[0]?.[0].event).not.toHaveProperty('formerAvatarId');
	});
});
