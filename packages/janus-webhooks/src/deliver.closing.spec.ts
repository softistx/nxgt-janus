import { afterEach, describe, expect, it, jest, mock, spyOn } from 'bun:test';
import { webhooks } from './deliver';
import {
	endpoint,
	event,
	givingUps,
	secret,
	until,
	url,
} from './deliver.fixtures';

// What close() does to the requests in flight and the retries waiting.

describe('webhooks', () => {
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
	// A case on the fake clock that times out never reaches its finally:
	// restored here too, or every later case's sleep would hang.
	afterEach(() => {
		mock.restore();
		jest.useRealTimers();
	});

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
				{ event, url, endpoint: '0', attempts: 1 },
				{ why: 'closed', status: 500, error: null },
			],
		]);
	});

	it('cancels a retry waiting, so none is sent after close', async () => {
		// On a fake clock: with a real one, a loaded runner could let the retry
		// fall due before close() and send it. Here nothing is due until the
		// spec says so, and the retry's own timer is what it waits for.
		jest.useFakeTimers();
		const timers = spyOn(globalThis, 'setTimeout');
		try {
			const { sent, fetch } = endpoint(500);
			const { given, onGivingUp } = givingUps();
			const listener = webhooks({
				endpoints: [{ url, secrets: [secret] }],
				retries: ['20ms'],
				fetch,
				onGivingUp,
			});

			listener(event);
			// setImmediate is not faked: each turn runs the microtasks the stub
			// fetch and the memory queue resolve on, until the retry is waiting.
			// Its delay is exactly 20 because the fake clock freezes Date.now()
			// too: the retry is due 20 ms from an instant that never moves.
			for (let turn = 0; !timers.mock.calls.some(([, ms]) => ms === 20); ) {
				if (++turn > 1_000) throw new Error('no retry was scheduled');
				await new Promise((resolve) => setImmediate(resolve));
			}
			await listener.close();
			jest.advanceTimersByTime(1_000);
			await new Promise((resolve) => setImmediate(resolve));

			expect(sent).toHaveLength(1);
			expect(given).toEqual([
				[
					{ event, url, endpoint: '0', attempts: 1 },
					{ why: 'closed', status: 500, error: null },
				],
			]);
		} finally {
			timers.mockRestore();
			jest.useRealTimers();
		}
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
