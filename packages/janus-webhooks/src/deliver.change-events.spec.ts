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

// The two change events of @nxgt/janus 0.13: posted like the others, and the
// former address of an e-mail change never past the listener.

const changed: UserEvent = Object.freeze({
	...event,
	type: 'user.emailChanged',
	formerEmail: 'ada@old.example',
});

describe('webhooks, on a password or an e-mail changed', () => {
	it('posts user.passwordChanged and user.emailChanged, which verifyWebhook reads back', async () => {
		const { sent, fetch } = endpoint(204);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			fetch,
		});

		listener({ ...event, type: 'user.passwordChanged' });
		listener(changed);
		await listener.close();

		const read = sent.map(({ init }) =>
			verifyWebhook({
				secrets: [secret],
				headers: init.headers as Record<string, string>,
				body: String(init.body),
			}),
		);
		expect(read.map((one) => one?.type)).toEqual([
			'user.passwordChanged',
			'user.emailChanged',
		]);
	});

	it('posts no former address: the body names the user by id alone, as it always has', async () => {
		const { sent, fetch } = endpoint(204);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			fetch,
		});

		listener(changed);
		await listener.close();

		expect(JSON.parse(String(sent[0]?.init.body))).toEqual({
			type: 'user.emailChanged',
			timestamp: event.occurredAt.toISOString(),
			data: { userId: event.userId, userType: event.userType },
		});
	});

	it('hands a queue of yours no former address either', async () => {
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
		expect(inserted[0]).not.toHaveProperty('formerEmail');
	});

	it('reports a delivery given up with no former address', async () => {
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			fetch: endpoint(204).fetch,
			onGivingUp,
		});
		await listener.close();

		listener(changed); // closed, with no queue: given up at once
		await until(() => given.length > 0);

		expect(given[0]?.[0].event).not.toHaveProperty('formerEmail');
	});

	it('leaves the event it was handed as it was', () => {
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret], types: ['user.passwordReset'] }],
		});

		listener(changed);

		expect(changed.formerEmail).toBe('ada@old.example');
	});
});
