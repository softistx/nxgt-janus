import { describe, expect, test } from 'bun:test';
import {
	baseOptions,
	issuedAt,
	reset,
	signIn,
	verification,
} from '../test/setup';
import { formatExpiry } from './expiry';
import { janusMail } from './janus-mail';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A text with every space made plain: Intl puts a no-break space between the
 * number and the unit where the locale's data says to — `1 heure`, but
 * `10 minutes` — and that data changes with the ICU release, not with us.
 */
const spaced = (text: string | undefined) => text?.replace(/\s/g, ' ');

describe('formatExpiry', () => {
	const cases: [ms: number, en: string, fr: string][] = [
		[MINUTE, '1 minute', '1 minute'],
		[10 * MINUTE, '10 minutes', '10 minutes'],
		[HOUR, '1 hour', '1 heure'],
		[3 * HOUR, '3 hours', '3 heures'],
		[DAY, '1 day', '1 jour'],
		[7 * DAY, '7 days', '7 jours'],
	];
	for (const [ms, en, fr] of cases) {
		test(`${en} in en, ${fr} in fr`, () => {
			expect(spaced(formatExpiry(ms, 'en'))).toBe(en);
			expect(spaced(formatExpiry(ms, 'fr'))).toBe(fr);
		});
	}

	test('an hour less the moment since the flow issued it is still 1 hour', () => {
		expect(spaced(formatExpiry(HOUR - 1_500, 'en'))).toBe('1 hour');
		expect(spaced(formatExpiry(DAY - 1_500, 'fr'))).toBe('1 jour');
	});

	test('rounded down to a whole unit: never more time than is left', () => {
		expect(spaced(formatExpiry(90 * MINUTE, 'en'))).toBe('1 hour');
		expect(spaced(formatExpiry(36 * HOUR, 'en'))).toBe('1 day');
		expect(spaced(formatExpiry(119 * MINUTE, 'fr'))).toBe('1 heure');
	});

	test('less than a minute is 1 minute', () => {
		expect(spaced(formatExpiry(20_000, 'en'))).toBe('1 minute');
		expect(spaced(formatExpiry(1, 'en'))).toBe('1 minute');
	});

	test('a regional locale formats in its language', () => {
		expect(spaced(formatExpiry(2 * HOUR, 'fr-CA'))).toBe('2 heures');
	});
});

describe('expiresIn in the e-mails', () => {
	test('derived from expiresAt, in the English e-mail', async () => {
		const options = baseOptions();
		await janusMail(options).verifyEmail(verification, { name: 'Ada' });
		expect(spaced(options.mailer.sent[0]?.text)).toContain(
			'This link expires in 1 hour.',
		);
	});

	test('and in the French one, in French', async () => {
		const options = baseOptions();
		const mail = janusMail(options);
		await mail.resetPassword(reset, { name: 'Ada', locale: 'fr' });
		await mail.signInCode(signIn, { locale: 'fr-CA' });
		const [resetMail, code] = options.mailer.sent;
		expect(spaced(resetMail?.text)).toContain('Ce lien expire dans 1 heure.');
		expect(spaced(code?.text)).toContain('Ce code expire dans 1 heure.');
		expect(spaced(code?.html)).toContain('1 heure');
	});

	test('in days and minutes as the flow set it', async () => {
		const options = baseOptions();
		const mail = janusMail(options);
		const now = issuedAt.getTime();
		await mail.verifyEmail(
			{ ...verification, expiresAt: new Date(now + DAY) },
			{ name: 'Ada', locale: 'fr' },
		);
		await mail.signInCode({
			...signIn,
			expiresAt: new Date(now + 10 * MINUTE),
		});
		const [verify, code] = options.mailer.sent;
		expect(spaced(verify?.text)).toContain('Ce lien expire dans 1 jour.');
		expect(spaced(code?.text)).toContain('This code expires in 10 minutes.');
	});

	test("the send's own expiresIn is used as is, expiresAt unread", async () => {
		const options = baseOptions();
		const mail = janusMail(options);
		await mail.verifyEmail(
			{ ...verification, expiresAt: new Date(Number.NaN) },
			{ name: 'Ada', locale: 'fr' },
			{ expiresIn: '24 heures' },
		);
		await mail.signInCode(signIn, undefined, { expiresIn: 'a moment' });
		const [verify, code] = options.mailer.sent;
		expect(verify?.text).toContain('Ce lien expire dans 24 heures.');
		expect(code?.text).toContain('This code expires in a moment.');
	});

	test('measured against the clock given, as janus({ clock }) is', async () => {
		const options = baseOptions();
		const mail = janusMail(options);
		options.clock.advance(20 * MINUTE);
		await mail.signInCode(signIn);
		expect(options.mailer.sent[0]?.text).toContain(
			'This code expires in 40 minutes.',
		);
	});

	test('without a clock, the system clock', async () => {
		const { clock: _, ...options } = baseOptions();
		await janusMail(options).signInCode({
			...signIn,
			expiresAt: new Date(Date.now() + 3 * DAY),
		});
		expect(options.mailer.sent[0]?.text).toContain(
			'This code expires in 3 days.',
		);
	});

	test('an override template is given expiresIn, derived', async () => {
		const options = baseOptions();
		let seen: string | undefined;
		await janusMail({
			...options,
			templates: {
				resetPassword: ({ expiresIn }) => {
					seen = expiresIn;
					return { subject: 'Reset', html: '<p>r</p>', text: 'r' };
				},
			},
		}).resetPassword(reset, { name: 'Ada', locale: 'fr' });
		expect(spaced(seen)).toBe('1 heure');
	});
});

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
