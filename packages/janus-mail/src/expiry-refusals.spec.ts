import { describe, expect, test } from 'bun:test';
import {
	baseOptions,
	issuedAt,
	reset,
	signIn,
	verification,
} from '../test/setup';
import { janusMail } from './janus-mail';

const MINUTE = 60_000;

describe('expiresIn refusals', () => {
	/** The error a send rejects with, settled where it is created. */
	const rejection = (sending: Promise<unknown>) =>
		sending.then(
			() => null,
			(e: unknown) => e,
		);

	test('an expiresAt that went through JSON is a TypeError, and nothing is sent', async () => {
		const options = baseOptions();
		const issued = JSON.parse(JSON.stringify(verification));
		const error = await rejection(
			janusMail(options).verifyEmail(issued, { name: 'Ada' }),
		);
		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toBe(
			'janusMail.verifyEmail: expiresAt must be a Date',
		);
		expect(options.mailer.attempts).toBe(0);
	});

	test('an invalid Date is refused the same way', async () => {
		const error = await rejection(
			janusMail(baseOptions()).signInCode({
				...signIn,
				expiresAt: new Date('not a date'),
			}),
		);
		expect((error as Error).message).toBe(
			'janusMail.signInCode: expiresAt must be a Date',
		);
	});

	test('an expiresAt already past is a TypeError: the link would not work', async () => {
		const options = baseOptions();
		const error = await rejection(
			janusMail(options).resetPassword(
				{ ...reset, expiresAt: new Date(issuedAt.getTime() - MINUTE) },
				{ name: 'Ada' },
			),
		);
		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toBe(
			'janusMail.resetPassword: expiresAt is past — the link or code would not work',
		);
		expect(options.mailer.attempts).toBe(0);
	});

	test('a clock whose now() answers no Date is a TypeError, and nothing is sent', async () => {
		const options = {
			...baseOptions(),
			clock: { now: () => Date.now() as unknown as Date },
		};
		const error = await rejection(janusMail(options).signInCode(signIn));
		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toBe(
			'janusMail.signInCode: clock.now() must answer a Date',
		);
		expect(options.mailer.attempts).toBe(0);
	});

	test('a clock whose now() answers an invalid Date is refused the same way', async () => {
		const options = {
			...baseOptions(),
			clock: { now: () => new Date(Number.NaN) },
		};
		const error = await rejection(
			janusMail(options).resetPassword(reset, { name: 'Ada' }),
		);
		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toBe(
			'janusMail.resetPassword: clock.now() must answer a Date',
		);
		expect(options.mailer.attempts).toBe(0);
	});

	test('a clock that is not one is a TypeError from janusMail()', () => {
		expect(() =>
			janusMail({
				...baseOptions(),
				clock: Date.now as unknown as { now(): Date },
			}),
		).toThrow(
			new TypeError(
				'janusMail: clock must be a Clock — an object with a now function',
			),
		);
	});

	test('an expiresIn that is not a string is a TypeError', async () => {
		const error = await rejection(
			janusMail(baseOptions()).verifyEmail(
				verification,
				{ name: 'Ada' },
				{ expiresIn: 3600 as unknown as string },
			),
		);
		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toBe(
			'janusMail.verifyEmail: expiresIn must be a string',
		);
	});
});
