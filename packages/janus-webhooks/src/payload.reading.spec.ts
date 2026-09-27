import { describe, expect, it } from 'bun:test';
import { bodyOf, verifyWebhook } from './payload';
import { event, now, request, seconds, secret } from './payload.fixtures';
import { keyOf, mintWebhookSecret, sign } from './signature';

// How bodyOf() writes an event, and how verifyWebhook() reads it back.

describe('bodyOf', () => {
	it('wraps the event in the Standard Webhooks envelope, the id left to its header', () => {
		expect(JSON.parse(bodyOf(event))).toEqual({
			type: 'user.created',
			timestamp: '2026-09-26T11:59:00.000Z',
			data: { userId: event.userId, userType: 'patient' },
		});
	});
});

describe('verifyWebhook', () => {
	it('answers the event a request carries, as janus sent it', () => {
		expect(verifyWebhook({ secrets: [secret], now, ...request() })).toEqual(
			event,
		);
	});

	it('reads fetch Headers and Node header records alike', () => {
		const { body, headers } = request();

		expect(
			verifyWebhook({
				secrets: [secret],
				now,
				body,
				headers: new Headers(headers),
			}),
		).toEqual(event);
	});

	it('reads a header Node repeated, as an array', () => {
		const { body, headers } = request();
		const other = sign(
			keyOf(mintWebhookSecret(), 'test'),
			event.id,
			seconds,
			body,
		);

		expect(
			verifyWebhook({
				secrets: [secret],
				now,
				body,
				headers: {
					...headers,
					'webhook-signature': [other, headers['webhook-signature']],
				},
			}),
		).toEqual(event);
	});

	it('reads a header record whatever the case of its keys', () => {
		const { body, headers } = request();
		const shouting = Object.fromEntries(
			Object.entries(headers).map(([name, value]) => [
				name.replace(/(^|-)[a-z]/g, (initial) => initial.toUpperCase()),
				value,
			]),
		);

		expect(Object.keys(shouting)).toContain('Webhook-Id');
		expect(
			verifyWebhook({ secrets: [secret], now, body, headers: shouting }),
		).toEqual(event);
	});

	it('accepts a request signed by any one of the secrets: a rotation drops none', () => {
		const next = mintWebhookSecret();

		expect(
			verifyWebhook({ secrets: [next, secret], now, ...request() }),
		).toEqual(event);
	});

	it('takes a tolerance of its own', () => {
		const late = request({ at: seconds - 30 });

		expect(
			verifyWebhook({ secrets: [secret], now, toleranceSeconds: 10, ...late }),
		).toBeNull();
		expect(verifyWebhook({ secrets: [secret], now, ...late })).toEqual(event);
	});
});
