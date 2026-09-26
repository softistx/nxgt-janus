import { describe, expect, it } from 'bun:test';
import type { UserEvent } from '@nxgt/janus';
import { bodyOf, verifyWebhook } from './payload';
import { keyOf, mintWebhookSecret, sign } from './signature';

const secret = mintWebhookSecret();
const now = new Date(Date.UTC(2026, 8, 26, 12));
const seconds = Math.floor(now.getTime() / 1000);

const event: UserEvent = Object.freeze({
	id: '0199a0db-f800-7000-8000-000000000001',
	type: 'user.created',
	occurredAt: new Date(Date.UTC(2026, 8, 26, 11, 59)),
	userId: '0199a0db-f800-7000-8000-000000000002',
	userType: 'patient',
});

/** A request as `webhooks()` sends it. */
function request(options: { at?: number; by?: string; body?: string } = {}) {
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

	it('takes a tolerance of its own', () => {
		const late = request({ at: seconds - 30 });

		expect(
			verifyWebhook({ secrets: [secret], now, toleranceSeconds: 10, ...late }),
		).toBeNull();
		expect(verifyWebhook({ secrets: [secret], now, ...late })).toEqual(event);
	});

	it('refuses, as wiring, a tolerance or a now that is not a number: it would let every timestamp through', () => {
		for (const toleranceSeconds of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
			expect(() =>
				verifyWebhook({
					secrets: [secret],
					now,
					toleranceSeconds,
					...request(),
				}),
			).toThrow(
				'verifyWebhook: toleranceSeconds is a finite number of seconds',
			);
		}
		expect(() =>
			verifyWebhook({ secrets: [secret], now: new Date('x'), ...request() }),
		).toThrow('verifyWebhook: now is a valid Date');
	});

	it('refuses, as wiring, no secret or a malformed one', () => {
		for (const secrets of [[], undefined]) {
			expect(() =>
				verifyWebhook({ secrets: secrets as never, now, ...request() }),
			).toThrow("verifyWebhook: pass the endpoint's secrets — at least one");
		}
		expect(() =>
			verifyWebhook({ secrets: ['hunter2'], now, ...request() }),
		).toThrow(TypeError);
	});
});
