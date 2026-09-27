import type { UserEvent } from '@nxgt/janus';
import { bodyOf } from './payload';
import { keyOf, mintWebhookSecret, sign } from './signature';

// What the payload.*.spec.ts files share: one secret, one instant, one
// event, and the request webhooks() would send for it.

export const secret = mintWebhookSecret();
export const now = new Date(Date.UTC(2026, 8, 26, 12));
export const seconds = Math.floor(now.getTime() / 1000);

export const event: UserEvent = Object.freeze({
	id: '0199a0db-f800-7000-8000-000000000001',
	type: 'user.created',
	occurredAt: new Date(Date.UTC(2026, 8, 26, 11, 59)),
	userId: '0199a0db-f800-7000-8000-000000000002',
	userType: 'patient',
});

/** A request as `webhooks()` sends it. */
export function request(
	options: { at?: number; by?: string; body?: string } = {},
) {
	const body = options.body ?? bodyOf(event);
	const at = options.at ?? seconds;
	return {
		body,
		headers: {
			'webhook-id': event.id,
			'webhook-timestamp': String(at),
			'webhook-signature': sign(
				keyOf(options.by ?? secret, 'test'),
				event.id,
				at,
				body,
			),
		},
	};
}
