import { describe, expect, it } from 'bun:test';
import { verifyWebhook } from './payload';
import { now, request, secret } from './payload.fixtures';

// What verifyWebhook() refuses as wiring.

describe('verifyWebhook', () => {
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
		for (const bad of [new Date('x'), 1]) {
			expect(() =>
				verifyWebhook({ secrets: [secret], now: bad as Date, ...request() }),
			).toThrow('verifyWebhook: now is a valid Date');
		}
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
