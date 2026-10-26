import { describe, expect, it } from 'bun:test';
import { concurrencyOf, limit } from './concurrency-limit';

function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('limit', () => {
	it('runs at most N tasks at once and queues the rest', async () => {
		const run = limit(2);
		let inFlight = 0;
		let peak = 0;
		const gates = Array.from({ length: 6 }, deferred);

		const results = gates.map((gate, index) =>
			run(async () => {
				inFlight += 1;
				peak = Math.max(peak, inFlight);
				await gate.promise;
				inFlight -= 1;
				return index;
			}),
		);
		await Promise.resolve();
		expect(inFlight).toBe(2);

		for (const gate of gates) {
			gate.resolve();
			await new Promise((r) => setTimeout(r, 0));
		}
		expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(peak).toBe(2);
	});

	it('starts queued tasks in the order they arrived', async () => {
		const run = limit(1);
		const started: number[] = [];
		const gates = Array.from({ length: 4 }, deferred);

		const results = gates.map((gate, index) =>
			run(async () => {
				started.push(index);
				await gate.promise;
			}),
		);
		for (const gate of gates) {
			gate.resolve();
			await new Promise((r) => setTimeout(r, 0));
		}
		await Promise.all(results);

		expect(started).toEqual([0, 1, 2, 3]);
	});

	it('frees the slot after a rejection', async () => {
		const run = limit(1);

		const failed = run(() => Promise.reject(new Error('boom')));
		const next = run(async () => 'ran');

		await expect(failed).rejects.toThrow('boom');
		expect(await next).toBe('ran');
	});

	it('frees the slot after a synchronous throw', async () => {
		const run = limit(1);

		const failed = run(() => {
			throw new Error('sync');
		});
		const next = run(async () => 'ran');

		await expect(failed).rejects.toThrow('sync');
		expect(await next).toBe('ran');
	});
});

describe('concurrencyOf', () => {
	it('defaults, and accepts 1 to 64', () => {
		expect(concurrencyOf('h', undefined, 4)).toBe(4);
		expect(concurrencyOf('h', 1, 4)).toBe(1);
		expect(concurrencyOf('h', 64, 4)).toBe(64);
	});

	it('refuses anything else', () => {
		for (const bad of [0, 65, -1, 1.5, Number.NaN]) {
			expect(() => concurrencyOf('h', bad, 4)).toThrow(TypeError);
		}
	});
});
