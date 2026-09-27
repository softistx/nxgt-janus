import { describe, expect, it } from 'bun:test';
import { webhooks } from './deliver';
import { endpoints, secret, url } from './durable.fixtures';
import { createMemoryWebhookQueue } from './queue/memory';

// What webhooks({ queue, … }) refuses as wiring, and what it takes.

describe('webhooks({ queue, … }) refuses, as wiring', () => {
	const queue = createMemoryWebhookQueue();

	it.each([
		[
			'a queue missing a method',
			{ endpoints, queue: { ...queue, extendLease: undefined } },
			'webhooks: queue is not a WebhookQueue — it has no extendLease',
		],
		[
			'a concurrency that is not a whole number',
			{ endpoints, concurrency: '4' },
			'webhooks: concurrency is a whole number of requests, 1 or more',
		],
		[
			'no concurrency at all',
			{ endpoints, concurrency: 0 },
			'webhooks: concurrency is a whole number of requests, 1 or more',
		],
		[
			'a lease less than timeout plus 1s',
			{ endpoints, queue, timeout: '10s', lease: '10999ms' },
			'webhooks: lease must be at least timeout plus 1s',
		],
		[
			'a timeout whose default lease would wait past 24 days',
			{ endpoints, queue, timeout: '2147483000ms' },
			'webhooks: timeout is too long — the default lease, timeout plus 30s, waits at most 24 days',
		],
		[
			'a poll without a queue',
			{ endpoints, poll: '1s' },
			'webhooks: poll and orphanGrace take effect with a queue only',
		],
		[
			'an orphanGrace without a queue',
			{ endpoints, orphanGrace: '1h' },
			'webhooks: poll and orphanGrace take effect with a queue only',
		],
		[
			'an id that is a URL',
			{ endpoints: [{ id: url, url, secrets: [secret] }] },
			"webhooks: an endpoint's id is 1 to 64 letters, digits, '.', '_' or '-'",
		],
		[
			'an id that is not a string',
			{ endpoints: [{ id: 1, url, secrets: [secret] }] },
			"webhooks: an endpoint's id is 1 to 64 letters, digits, '.', '_' or '-'",
		],
		[
			'two endpoints with one id',
			{
				endpoints: [
					{ id: 'crm', url, secrets: [secret] },
					{ id: 'crm', url: 'https://other.example.test', secrets: [secret] },
				],
			},
			'webhooks: two endpoints have one id',
		],
		[
			'two endpoints with one URL and no id, with a queue',
			{
				endpoints: [
					{ url, secrets: [secret] },
					{ url, secrets: [secret] },
				],
				queue,
			},
			'webhooks: two endpoints have one id',
		],
	])('%s', (_, options, message) => {
		expect(() => webhooks(options as never)).toThrow(message);
	});

	it('takes two endpoints with one URL without a queue, as 0.1.0 did', () => {
		expect(() =>
			webhooks({
				endpoints: [
					{ url, secrets: [secret] },
					{ url, secrets: [secret] },
				],
			}),
		).not.toThrow();
	});

	it('takes, without a queue, an id written that is the position of another', () => {
		// Without a queue a position is a key no id written can take.
		expect(() =>
			webhooks({
				endpoints: [
					{ id: '1', url, secrets: [secret] },
					{ url: 'https://other.example.test', secrets: [secret] },
				],
			}),
		).not.toThrow();
	});

	it('takes a lease of exactly timeout plus 1s', () => {
		expect(() =>
			webhooks({ endpoints, queue, timeout: '10s', lease: '11s' }),
		).not.toThrow();
	});
});
