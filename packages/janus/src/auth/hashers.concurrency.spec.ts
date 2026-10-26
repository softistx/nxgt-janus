import { describe, expect, it, mock } from 'bun:test';
import * as real from 'node:crypto';

// Counts the scrypt calls in flight by wrapping node:crypto's own scrypt. The
// mock must be registered before `./hashers` is imported.
// Captured first: the mock replaces the export on this very namespace.
const realScrypt = real.scrypt as (...a: unknown[]) => void;
let inFlight = 0;
let peak = 0;
mock.module('node:crypto', () => ({
	...real,
	scrypt: (...args: unknown[]) => {
		const callback = args[args.length - 1] as (...done: unknown[]) => void;
		inFlight += 1;
		peak = Math.max(peak, inFlight);
		realScrypt(...args.slice(0, -1), (...done: unknown[]) => {
			inFlight -= 1;
			callback(...done);
		});
	},
}));

const { scryptHasher } = await import('./hashers');

describe('scryptHasher concurrency', () => {
	it('runs at most `concurrency` verifies at once and still answers every one', async () => {
		const hasher = scryptHasher({ cost: 10, concurrency: 2 });
		const hash = await hasher.hash('correct horse');
		peak = 0;

		const answers = await Promise.all(
			Array.from({ length: 10 }, (_, index) =>
				hasher.verify(index % 2 === 0 ? 'correct horse' : 'wrong', hash),
			),
		);

		expect(answers).toEqual(
			Array.from({ length: 10 }, (_, index) => index % 2 === 0),
		);
		expect(peak).toBe(2);
	});

	it('gives each hasher its own limiter', async () => {
		const first = scryptHasher({ cost: 10, concurrency: 1 });
		const second = scryptHasher({ cost: 10, concurrency: 1 });
		peak = 0;

		await Promise.all([first.hash('a'), second.hash('b')]);

		expect(peak).toBe(2);
	});
});
