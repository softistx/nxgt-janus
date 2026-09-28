import { describe, expect, it } from 'bun:test';
import { resolveSignInThrottle } from './resolve-sign-in';

/** Resolves from JavaScript: the types would refuse most of these first. */
const resolve = (config: unknown) => () =>
	resolveSignInThrottle(
		config as Parameters<typeof resolveSignInThrottle>[0],
		'janus',
	);

describe('signIn.throttle', () => {
	it('is on by default: ten passwords per login per fifteen minutes', () => {
		expect(resolve(undefined)()).toEqual({ attempts: 10, windowMs: 900_000 });
		expect(resolve({})()).toEqual({ attempts: 10, windowMs: 900_000 });
		expect(resolve({ throttle: {} })()).toEqual({
			attempts: 10,
			windowMs: 900_000,
		});
	});

	it('takes attempts and a window, and false to count nothing', () => {
		expect(resolve({ throttle: { attempts: 3, window: '1h' } })()).toEqual({
			attempts: 3,
			windowMs: 3_600_000,
		});
		expect(resolve({ throttle: false })()).toBeNull();
	});

	it('refuses what cannot count, naming the option', () => {
		expect(resolve(false)).toThrow(
			'janus: signIn must be an object — { throttle }',
		);
		expect(resolve({ throttle: true })).toThrow(
			'janus: signIn.throttle must be { attempts, window }, or false to count nothing',
		);
		for (const attempts of [0, -1, 2.5, Number.NaN, '10']) {
			expect(resolve({ throttle: { attempts } })).toThrow(
				'janus: signIn.throttle.attempts must be a whole number above zero',
			);
		}
		expect(resolve({ throttle: { window: '15 minutes' } })).toThrow(
			'janus: signIn.throttle.window',
		);
	});
});
