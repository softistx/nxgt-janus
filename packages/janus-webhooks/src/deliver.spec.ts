import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import type { UserEvent } from '@nxgt/janus';
import { type Delivery, type GivingUp, webhooks } from './deliver';
import { verifyWebhook } from './payload';
import { mintWebhookSecret } from './signature';

const secret = mintWebhookSecret();
const url = 'https://hooks.example.test/janus?token=sentinel';

const event: UserEvent = Object.freeze({
	id: '0199a0db-f800-7000-8000-000000000001',
	type: 'user.created',
	occurredAt: new Date(Date.UTC(2026, 8, 26, 11, 59)),
	userId: '0199a0db-f800-7000-8000-000000000002',
	userType: 'user',
});

interface Sent {
	readonly url: string;
	readonly init: RequestInit;
}

/**
 * A fetch that answers each request with the next status of `answers` — a
 * number, or `'throw'` for a network failure — and the last one after them.
 */
function endpoint(...answers: (number | 'throw')[]) {
	const sent: Sent[] = [];
	const fetch = (async (input: string, init: RequestInit) => {
		sent.push({ url: input, init });
		const answer = answers[Math.min(sent.length, answers.length) - 1] ?? 200;
		if (answer === 'throw') throw new TypeError('fetch failed');
		return new Response('ignored', { status: answer });
	}) as unknown as typeof globalThis.fetch;
	return { sent, fetch };
}

/** Resolves once `check` holds, polling: deliveries run on their own. */
async function until(check: () => boolean): Promise<void> {
	for (let tries = 0; !check(); tries++) {
		if (tries > 200) throw new Error('never happened');
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

function givingUps() {
	const given: [Delivery, GivingUp][] = [];
	return {
		given,
		onGivingUp: (delivery: Delivery, reason: GivingUp) => {
			given.push([delivery, reason]);
		},
	};
}

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
				{ event, url, attempts: 3 },
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

	it('on close, waits for the requests in flight and gives up the retries still waiting', async () => {
		const { sent, fetch } = endpoint(500);
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: ['1h'],
			fetch,
			onGivingUp,
		});

		listener(event);
		await until(() => sent.length === 1 && given.length === 0);
		await new Promise((resolve) => setTimeout(resolve, 5));
		await listener.close();
		listener({ ...event, type: 'user.deleted' });
		await until(() => given.length === 2);

		expect(sent).toHaveLength(1);
		expect(
			given.map(([delivery, reason]) => [delivery.attempts, reason]),
		).toEqual([
			[1, { why: 'closed', status: 500, error: null }],
			[0, { why: 'closed', status: null, error: null }],
		]);
	});
});

describe('close(), racing a request in flight', () => {
	/** A fetch whose answer the spec gives by hand, once the request is sent. */
	function held() {
		const sent: string[] = [];
		let answer: (status: number) => void = () => {};
		const fetch = ((input: string) => {
			sent.push(input);
			return new Promise<Response>((resolve) => {
				answer = (status) => resolve(new Response(null, { status }));
			});
		}) as unknown as typeof globalThis.fetch;
		return { sent, fetch, answer: (status: number) => answer(status) };
	}

	it('waits for it, and gives it up as closed when it then fails — no retry sent after', async () => {
		const { sent, fetch, answer } = held();
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: ['5ms'],
			fetch,
			onGivingUp,
		});

		listener(event);
		let done = false;
		const closing = listener.close().then(() => {
			done = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(done).toBe(false);

		answer(500);
		await closing;
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(sent).toHaveLength(1);
		expect(given).toEqual([
			[
				{ event, url, attempts: 1 },
				{ why: 'closed', status: 500, error: null },
			],
		]);
	});

	it('cancels a retry waiting, so none is sent after close', async () => {
		const { sent, fetch } = endpoint(500);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: ['20ms'],
			fetch,
			onGivingUp: () => {},
		});

		listener(event);
		await until(() => sent.length === 1);
		await new Promise((resolve) => setTimeout(resolve, 5));
		await listener.close();
		await new Promise((resolve) => setTimeout(resolve, 40));

		expect(sent).toHaveLength(1);
	});

	it('waits for an onGivingUp that takes its time', async () => {
		const { fetch } = endpoint(500);
		let reported = false;
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: ['1h'],
			fetch,
			onGivingUp: async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				reported = true;
			},
		});

		listener(event);
		await new Promise((resolve) => setTimeout(resolve, 5));
		await listener.close();

		expect(reported).toBe(true);
	});
});

describe('an event whose body cannot be built', () => {
	it('is given up like a request that could not be sent, never an unhandled rejection', async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => unhandled.push(reason);
		process.on('unhandledRejection', onUnhandled);
		const { sent, fetch } = endpoint(200);
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: [],
			fetch,
			onGivingUp,
		});

		listener({ ...event, occurredAt: new Date(Number.NaN) });
		await listener.close();
		await new Promise((resolve) => setTimeout(resolve, 5));
		process.off('unhandledRejection', onUnhandled);

		expect(sent).toEqual([]);
		expect(unhandled).toEqual([]);
		expect(given[0]?.[1]).toEqual({
			why: 'retriesRanOut',
			status: null,
			error: 'RangeError',
		});
	});
});

describe('giving up, unheard', () => {
	const warnings: Error[] = [];
	const onWarning = (warning: Error) => warnings.push(warning);
	process.on('warning', onWarning);
	afterEach(() => {
		warnings.length = 0;
	});
	afterAll(() => {
		process.off('warning', onWarning);
	});

	it('is a JANUS_WEBHOOK_GAVE_UP warning naming the event and the origin, never the URL', async () => {
		const { fetch } = endpoint(410);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: [],
			fetch,
		});

		listener(event);
		await listener.close();
		await until(() => warnings.length === 1);

		const [warning] = warnings;
		expect((warning as Error & { code?: string }).code).toBe(
			'JANUS_WEBHOOK_GAVE_UP',
		);
		expect(warning?.message).toContain(event.id);
		expect(warning?.message).toContain('user.created');
		expect(warning?.message).toContain('https://hooks.example.test');
		expect(warning?.message).toContain('after 1 attempt (retriesRanOut, 410)');
		// The path and query may hold a token of the receiver's.
		expect(warning?.message).not.toContain('sentinel');
	});

	it('is a JANUS_WEBHOOK_REPORT_FAILED warning when onGivingUp throws', async () => {
		const { fetch } = endpoint(500);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: [],
			fetch,
			onGivingUp: () => {
				throw new Error('dead letters full');
			},
		});

		listener(event);
		await listener.close();
		await until(() => warnings.length === 1);

		expect((warnings[0] as Error & { code?: string }).code).toBe(
			'JANUS_WEBHOOK_REPORT_FAILED',
		);
		expect(warnings[0]?.message).not.toContain('dead letters');
	});
});

describe('webhooks({ … }) refuses, as wiring', () => {
	const endpoints = [{ url, secrets: [secret] as [string] }];

	it.each([
		['no endpoint', { endpoints: [] }, 'webhooks: pass at least one endpoint'],
		[
			'a URL that is not one',
			{ endpoints: [{ url: 'listener', secrets: [secret] }] },
			"webhooks: an endpoint's url is not a URL",
		],
		[
			'plain http to another host',
			{ endpoints: [{ url: 'http://hooks.example.test', secrets: [secret] }] },
			"webhooks: an endpoint's url must be https:// — http:// only to localhost",
		],
		[
			'no secret',
			{ endpoints: [{ url, secrets: [] }] },
			'webhooks: an endpoint needs at least one secret',
		],
		[
			'a secret that is not whsec_',
			{ endpoints: [{ url, secrets: ['hunter2'] }] },
			'webhooks: a secret is written whsec_<base64>',
		],
		[
			'a type that is not a user event type',
			{ endpoints: [{ url, secrets: [secret], types: ['invoice.paid'] }] },
			"webhooks: an endpoint's types are user event types",
		],
		[
			'a retry that is not a duration',
			{ endpoints, retries: ['soon'] },
			'webhooks: retries',
		],
		[
			'a timeout that is not a duration',
			{ endpoints, timeout: -1 },
			'webhooks: timeout',
		],
		[
			'a retry longer than a timer can wait',
			{ endpoints, retries: ['30d'] },
			'webhooks: retries wait at most 24 days each',
		],
		[
			'retries that are not a list',
			{ endpoints, retries: '5s' },
			'webhooks: retries is a list of durations',
		],
	])('%s', (_, options, message) => {
		expect(() => webhooks(options as never)).toThrow(message);
	});

	it('takes plain http to localhost, for development', () => {
		expect(() =>
			webhooks({
				endpoints: [{ url: 'http://localhost:3000/hooks', secrets: [secret] }],
			}),
		).not.toThrow();
	});
});
