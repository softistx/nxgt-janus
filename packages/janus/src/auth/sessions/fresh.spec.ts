import { describe, expect, it } from 'bun:test';
import { StepUpRequiredError } from '../../errors/janus-error';
import { fixedClock } from '../../time/clock';
import { assertFresh } from './fresh';

const session = {
	userId: '0192b3a4-0000-7000-8000-000000000001',
	authenticatedAt: new Date(Date.UTC(2026, 8, 23)),
};

describe('assertFresh', () => {
	it('lets through a session that proved who it is less than maxAge ago', () => {
		const clock = fixedClock(Date.UTC(2026, 8, 23));
		clock.advance(10 * 60_000 - 1);
		expect(() => assertFresh(session, '10m', clock)).not.toThrow();
		expect(() => assertFresh(session, 600_000, clock)).not.toThrow();
	});

	it('refuses one that proved it maxAge ago or more, with STEP_UP_REQUIRED and its user', () => {
		const clock = fixedClock(Date.UTC(2026, 8, 23));
		clock.advance(10 * 60_000);

		let refusal: unknown;
		try {
			assertFresh(session, '10m', clock);
		} catch (error) {
			refusal = error;
		}
		expect(refusal).toBeInstanceOf(StepUpRequiredError);
		expect(refusal).toMatchObject({
			code: 'STEP_UP_REQUIRED',
			userId: session.userId,
			message:
				'assertFresh: the session proved who it is longer ago than maxAge — confirm with a step-up',
		});
	});

	it('reads the system clock when given none', () => {
		const old = { ...session, authenticatedAt: new Date(Date.now() - 60_000) };
		expect(() => assertFresh(old, '2m')).not.toThrow();
		expect(() => assertFresh(old, '30s')).toThrow(StepUpRequiredError);
	});

	it('refuses a maxAge that is no duration with a TypeError naming it', () => {
		expect(() =>
			assertFresh(session, '10 minutes' as unknown as '10m'),
		).toThrow(
			new TypeError(
				'assertFresh: maxAge: "10 minutes" is not a duration; write a number followed by ms, s, m, h or d — for example "15m" or "720h"',
			),
		);
	});
});
