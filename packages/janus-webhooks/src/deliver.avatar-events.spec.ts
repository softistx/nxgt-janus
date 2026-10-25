import { describe, expect, it } from 'bun:test';
import type { UserEvent } from '@nxgt/janus';
import { webhooks } from './deliver';
import { endpoint, event, secret, url } from './deliver.fixtures';
import { verifyWebhook } from './payload';

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
});
