import { describe, expect, test } from 'bun:test';
import {
	baseOptions,
	partsOf,
	reset,
	signIn,
	verification,
} from '../test/setup';
import { janusMail } from './janus-mail';

describe('sending', () => {
	test('each e-mail goes to the address the flow answered, from `from`', async () => {
		const options = baseOptions();
		const mail = janusMail(options);
		await mail.verifyEmail(
			{ ...verification, email: 'verify@example.com' },
			{ name: 'Ada' },
		);
		await mail.resetPassword(
			{ ...reset, email: 'reset@example.com' },
			{ name: 'Ada' },
		);
		await mail.signInCode({ ...signIn, email: 'code@example.com' });
		await mail.passwordChanged({ name: 'Ada', email: 'changed@example.com' });
		expect(options.mailer.sent.map((sent) => sent.to)).toEqual([
			'verify@example.com',
			'reset@example.com',
			'code@example.com',
			'changed@example.com',
		]);
		for (const sent of options.mailer.sent) {
			expect(sent.from).toBe('noreply@acme.example');
			expect(sent.replyTo).toBeUndefined();
		}
	});

	test('the e-mail-changed e-mail goes to the former address, never the new one', async () => {
		const options = baseOptions();
		await janusMail(options).emailChanged({
			name: 'Ada',
			formerEmail: 'former@example.com',
			newEmail: 'new@example.com',
		});
		expect(options.mailer.sent[0]?.to).toBe('former@example.com');
	});

	test('replyTo, when given, is on every e-mail', async () => {
		const replyTo = { name: 'Acme support', address: 'support@acme.example' };
		const options = { ...baseOptions(), replyTo };
		await janusMail(options).signInCode(signIn);
		expect(options.mailer.sent[0]?.replyTo).toEqual(replyTo);
	});

	test('answers what the mailer answered', async () => {
		const options = baseOptions();
		expect(await janusMail(options).signInCode(signIn)).toEqual({
			messageId: 'memory-1',
		});
	});

	test('the challenge is in no part of the sign-in code e-mail — the code is', async () => {
		const options = baseOptions();
		await janusMail(options).signInCode(signIn);
		const parts = partsOf(options.mailer.sent[0]);
		for (const part of parts) expect(part).not.toContain(signIn.challenge);
		expect(parts.join('\n')).toContain(signIn.code);
	});

	test('an override is never given the challenge either', async () => {
		const options = baseOptions();
		let seen: object | undefined;
		const mail = janusMail({
			...options,
			templates: {
				signInCode: (variables) => {
					seen = variables;
					return { subject: 'Code', html: '<p>code</p>', text: 'code' };
				},
			},
		});
		await mail.signInCode(signIn);
		expect(seen).toEqual({
			brand: 'Acme',
			code: '042817',
			expiresIn: '1 hour',
			locale: 'en',
		});
	});

	test('what a template answers besides its three parts is not sent', async () => {
		const options = baseOptions();
		const rendered = {
			subject: 'Hi',
			html: '<p>Hi</p>',
			text: 'Hi',
			to: 'attacker@example.com',
			headers: { 'X-Extra': 'yes' },
		};
		await janusMail({
			...options,
			templates: { signInCode: () => rendered },
		}).signInCode(signIn);
		const [sent] = options.mailer.sent;
		expect(sent?.to).toBe(signIn.email);
		expect(sent?.headers).toBeUndefined();
	});
});
