import { describe, expect, it } from 'bun:test';
import { resolveMailThrottle } from './resolve-throttle';

/** Resolves from JavaScript: the types would refuse most of these first. */
const resolve = (config: unknown) => () =>
	resolveMailThrottle(
		config as Parameters<typeof resolveMailThrottle>[0],
		'janus',
	);

describe('mail.throttle', () => {
	it('is on by default: five requests per flow and address per ten minutes', () => {
		expect(resolve(undefined)()).toEqual({ attempts: 5, windowMs: 600_000 });
		expect(resolve({})()).toEqual({ attempts: 5, windowMs: 600_000 });
		expect(resolve({ throttle: {} })()).toEqual({
			attempts: 5,
			windowMs: 600_000,
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
		for (const config of [false, null, 'off', 5]) {
			expect(resolve(config)).toThrow(
				'janus: mail must be an object — { throttle }',
			);
		}
		for (const throttle of [true, 5, 'off']) {
			expect(resolve({ throttle })).toThrow(
				'janus: mail.throttle must be { attempts, window }, or false to count nothing',
			);
		}
		for (const attempts of [0, -1, 2.5, Number.NaN, '5']) {
			expect(resolve({ throttle: { attempts } })).toThrow(
				'janus: mail.throttle.attempts must be a whole number above zero',
			);
		}
		expect(resolve({ throttle: { window: '15 minutes' } })).toThrow(
			'janus: mail.throttle.window',
		);
		expect(resolve({ throttle: { window: 0 } })).toThrow(
			'janus: mail.throttle.window',
		);
	});
});
