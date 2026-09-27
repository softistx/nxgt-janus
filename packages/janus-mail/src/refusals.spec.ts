import { describe, expect, test } from 'bun:test';
import { MailError, MailFailure, MailRefused } from '@nxgt/mail';
import { baseOptions, signIn, verification } from '../test/setup';
import { janusMail } from './janus-mail';

describe('refusals and failures pass through untouched', () => {
	test('a javascript: link is MailRefused, and nothing reaches the mailer', async () => {
		const options = {
			...baseOptions(),
			links: {
				...baseOptions().links,
				verifyEmail: () => 'javascript:alert(1)',
			},
		};
		// Settled where it is created: a rejection awaited late is counted unhandled.
		const error = await janusMail(options)
			.verifyEmail(verification, { name: 'Ada' })
			.then(
				() => null,
				(e: unknown) => e,
			);
		expect(error).toBeInstanceOf(MailRefused);
		expect((error as MailRefused).code).toBe('MAIL_REFUSED');
		expect(options.mailer.attempts).toBe(0);
		expect(options.mailer.sent).toEqual([]);
	});

	test('a relative link is refused the same way', async () => {
		const options = {
			...baseOptions(),
			links: { ...baseOptions().links, secureAccount: () => '/account' },
		};
		const error = await janusMail(options)
			.passwordChanged({ name: 'Ada', email: 'ada@example.com' })
			.then(
				() => null,
				(e: unknown) => e,
			);
		expect(error).toBeInstanceOf(MailRefused);
		expect(options.mailer.attempts).toBe(0);
	});

	test("the mailer's MailFailure is the very error the call rejects with", async () => {
		const options = baseOptions();
		const outage = new MailFailure('send: the provider could not be reached');
		options.mailer.failNext(outage);
		const error = await janusMail(options)
			.signInCode(signIn)
			.then(
				() => null,
				(e: unknown) => e,
			);
		expect(error).toBe(outage);
		expect(error).toBeInstanceOf(MailError);
		expect(options.mailer.attempts).toBe(1); // tried once, never retried in secret
		expect(options.mailer.sent).toEqual([]);
	});

	test("the mailer's own refusal passes through too", async () => {
		const options = baseOptions();
		const error = await janusMail(options)
			.signInCode({ ...signIn, email: 'Ada <ada@example.com>' })
			.then(
				() => null,
				(e: unknown) => e,
			);
		expect(error).toBeInstanceOf(MailRefused);
		expect(options.mailer.sent).toEqual([]);
	});
});
