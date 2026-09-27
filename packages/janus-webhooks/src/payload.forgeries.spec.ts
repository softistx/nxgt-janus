import { describe, expect, it } from 'bun:test';
import { bodyOf, verifyWebhook } from './payload';
import { event, now, request, seconds, secret } from './payload.fixtures';
import { mintWebhookSecret } from './signature';

// What verifyWebhook() answers null: every request it cannot vouch for.

describe('verifyWebhook', () => {
	it.each([
		['another secret', request({ by: mintWebhookSecret() })],
		[
			'an altered body',
			{ ...request(), body: bodyOf({ ...event, userId: 'x' }) },
		],
		['a timestamp too old — a replay', request({ at: seconds - 301 })],
		['a timestamp too far ahead', request({ at: seconds + 301 })],
		[
			'a body that is not a user event',
			request({ body: JSON.stringify({ type: 'invoice.paid' }) }),
		],
		['a body that is not JSON', request({ body: 'not json' })],
		[
			'a signature of the wrong length',
			{
				...request(),
				headers: { ...request().headers, 'webhook-signature': 'v1,abc' },
			},
		],
		[
			'an empty signature',
			{
				...request(),
				headers: { ...request().headers, 'webhook-signature': '' },
			},
		],
		['a signed body that is null', request({ body: 'null' })],
		[
			'a signed body whose data is null',
			request({
				body: JSON.stringify({
					type: 'user.created',
					timestamp: event.occurredAt.toISOString(),
					data: null,
				}),
			}),
		],
		[
			'a signed body whose userType is not a string',
			request({
				body: JSON.stringify({
					type: 'user.created',
					timestamp: event.occurredAt.toISOString(),
					data: { userId: event.userId, userType: 42 },
				}),
			}),
		],
		[
			'a signed body whose timestamp is a number',
			request({
				body: JSON.stringify({
					type: 'user.created',
					timestamp: 12345,
					data: { userId: event.userId, userType: 'user' },
				}),
			}),
		],
		[
			'a signed body whose type is an Object.prototype key',
			request({
				body: JSON.stringify({
					type: 'toString',
					timestamp: event.occurredAt.toISOString(),
					data: { userId: event.userId, userType: 'user' },
				}),
			}),
		],
		[
			'a timestamp header that is not plain seconds, though in range',
			{
				...request(),
				headers: { ...request().headers, 'webhook-timestamp': `${seconds}.0` },
			},
		],
		[
			'a signed body whose userId is not a string',
			request({
				body: JSON.stringify({
					type: 'user.created',
					timestamp: event.occurredAt.toISOString(),
					data: { userId: 42, userType: 'user' },
				}),
			}),
		],
		[
			'a signed body whose timestamp is not a date',
			request({
				body: JSON.stringify({
					type: 'user.created',
					timestamp: 'yesterday',
					data: { userId: event.userId, userType: 'user' },
				}),
			}),
		],
	])('answers null for %s', (_, forged) => {
		expect(verifyWebhook({ secrets: [secret], now, ...forged })).toBeNull();
	});

	it('answers null for a missing header, or a timestamp that is not seconds', () => {
		const { body, headers } = request();
		const { 'webhook-signature': _, ...unsigned } = headers;

		expect(
			verifyWebhook({ secrets: [secret], now, body, headers: unsigned }),
		).toBeNull();
		expect(
			verifyWebhook({
				secrets: [secret],
				now,
				body,
				headers: { ...headers, 'webhook-timestamp': '1e9' },
			}),
		).toBeNull();
	});
});
