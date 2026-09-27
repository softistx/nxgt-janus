import { describe, expect, it } from 'bun:test';
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
import { mintWebhookSecret } from './signature';

// What webhooks() sends without a queue: signed, filtered, retried, given up.

describe('webhooks', () => {
	it('posts the event, signed so that verifyWebhook reads it back', async () => {
		const { sent, fetch } = endpoint(204);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			fetch,
		});

		listener(event);
		await listener.close();

		expect(sent).toHaveLength(1);
		const init: RequestInit = sent[0]?.init ?? {};
		expect(sent[0]?.url).toBe(url);
		expect(init.method).toBe('POST');
		expect(init.redirect).toBe('manual');
		const headers = init.headers as Record<string, string>;
		expect(headers['content-type']).toBe('application/json');
		expect(headers['webhook-id']).toBe(event.id);
		expect(
			verifyWebhook({ secrets: [secret], headers, body: String(init.body) }),
		).toEqual(event);
	});

	it('returns at once: no flow waits on an endpoint', () => {
		const fetch = (() =>
			new Promise(() => {})) as unknown as typeof globalThis.fetch;
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			fetch,
		});

		expect(listener(event)).toBeUndefined();
	});

	it('signs with every secret while one is rotated, so either verifies', async () => {
		const next = mintWebhookSecret();
		const { sent, fetch } = endpoint(200);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret, next] }],
			fetch,
		});

		listener(event);
		await listener.close();

		const headers = sent[0]?.init.headers as Record<string, string>;
		const body = String(sent[0]?.init.body);
		expect(headers['webhook-signature']?.split(' ')).toHaveLength(2);
		expect(verifyWebhook({ secrets: [next], headers, body })).toEqual(event);
		expect(verifyWebhook({ secrets: [secret], headers, body })).toEqual(event);
	});

	it('sends each endpoint only the types it asked for', async () => {
		const all = endpoint(200);
		const deleted = endpoint(200);
		const listener = webhooks({
			endpoints: [
				{ url, secrets: [secret] },
				{
					url: 'https://crm.example.test/',
					secrets: [secret],
					types: ['user.deleted'],
				},
			],
			fetch: (async (input: string, init: RequestInit) =>
				(input === url ? all : deleted).fetch(
					input,
					init,
				)) as unknown as typeof globalThis.fetch,
		});

		listener(event);
		listener({ ...event, type: 'user.deleted' });
		await listener.close();

		expect(all.sent).toHaveLength(2);
		expect(deleted.sent).toHaveLength(1);
		expect(JSON.parse(String(deleted.sent[0]?.init.body)).type).toBe(
			'user.deleted',
		);
	});

	it('retries a failure on its schedule — a status other than 2xx, a network error — until one succeeds', async () => {
		const { sent, fetch } = endpoint(500, 'throw', 302, 200);
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: ['5ms', '5ms', '5ms'],
			fetch,
			onGivingUp,
		});

		listener(event);
		await until(() => sent.length === 4);
		await listener.close();

		expect(sent).toHaveLength(4);
		expect(given).toEqual([]);
		// The same id every time: the receiver's key to handle it once.
		const ids = sent.map(
			(one) => (one.init.headers as Record<string, string>)['webhook-id'],
		);
		expect(new Set(ids)).toEqual(new Set([event.id]));
	});

	it('gives up when the retries run out, and says why', async () => {
		const { sent, fetch } = endpoint(503);
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: ['5ms', '5ms'],
			fetch,
			onGivingUp,
		});

		listener(event);
		await until(() => given.length === 1);

		expect(sent).toHaveLength(3);
		expect(given).toEqual([
			[
				{ event, url, endpoint: '0', attempts: 3 },
				{ why: 'retriesRanOut', status: 503, error: null },
			],
		]);
		await listener.close();
	});

	it('names a request that took too long a TimeoutError', async () => {
		const fetch = ((_: string, init: RequestInit) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener('abort', () =>
					reject(init.signal?.reason),
				);
			})) as unknown as typeof globalThis.fetch;
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: [],
			timeout: '10ms',
			fetch,
			onGivingUp,
		});

		listener(event);
		await until(() => given.length === 1);

		expect(given[0]?.[1]).toEqual({
			why: 'retriesRanOut',
			status: null,
			error: 'TimeoutError',
		});
	});
});
