import { describe, expect, it } from 'bun:test';
import { parseDuration } from './duration';

describe('parseDuration', () => {
	it('reads the notation a configuration file uses', () => {
		expect(parseDuration('250ms', 'session.lifespan')).toBe(250);
		expect(parseDuration('30s', 'session.lifespan')).toBe(30_000);
		expect(parseDuration('15m', 'tokens.recovery')).toBe(900_000);
		expect(parseDuration('720h', 'session.lifespan')).toBe(2_592_000_000);
		expect(parseDuration('30d', 'session.lifespan')).toBe(2_592_000_000);
	});

	it('takes a plain number as milliseconds', () => {
		expect(parseDuration(1_500, 'session.earliestRefresh')).toBe(1_500);
	});

	it('names the option the consumer wrote', () => {
		// This package has half a dozen durations. `parseDuration: ...` would
		// leave the reader to work out which one.
		expect(() =>
			parseDuration('720hours' as never, 'session.lifespan'),
		).toThrow(/^session\.lifespan: "720hours" is not a duration/);
	});

	it('says what shape it wanted, with an example', () => {
		expect(() => parseDuration('soon' as never, 'tokens.verification')).toThrow(
			/write a number followed by ms, s, m, h or d — for example "15m" or "720h"/,
		);
	});

	it('catches the one spelling the type cannot refuse', () => {
		// `'30 m'` type-checks: TypeScript's `${number}` placeholder tolerates
		// trailing whitespace inside the number, so `Duration` accepts it. This
		// is the runtime half of that gap, and `test/types/refusals.ts` records
		// the gap itself rather than claiming a refusal we do not have.
		expect(() => parseDuration('30 m' as never, 'session.lifespan')).toThrow(
			/^session\.lifespan: "30 m" is not a duration/,
		);
	});

	it('refuses zero, a negative and a non-finite number', () => {
		expect(() => parseDuration(0, 'session.lifespan')).toThrow(TypeError);
		expect(() => parseDuration(-1, 'session.lifespan')).toThrow(TypeError);
		expect(() => parseDuration(Number.NaN, 'session.lifespan')).toThrow(
			TypeError,
		);
		expect(() => parseDuration('0m' as never, 'session.lifespan')).toThrow(
			/must be above zero/,
		);
	});
});
