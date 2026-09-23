import { describe, expect, it } from 'bun:test';
import { fixedClock, systemClock } from './clock';

describe('fixedClock', () => {
	it('is what a spec drives instead of reaching for fake timers', () => {
		// Every expiry here is a comparison against `now`. A spec that moves the
		// real clock needs fake timers, leaks them, and fails differently under
		// load.
		const clock = fixedClock(1_000);

		expect(clock.now().getTime()).toBe(1_000);
		clock.advance(500);
		expect(clock.now().getTime()).toBe(1_500);
		clock.set(new Date(9_000));
		expect(clock.now().getTime()).toBe(9_000);
	});
});

describe('systemClock', () => {
	it('is the process’s own clock', () => {
		const before = Date.now();
		const now = systemClock.now().getTime();

		expect(now).toBeGreaterThanOrEqual(before);
		expect(now).toBeLessThanOrEqual(Date.now());
	});
});
