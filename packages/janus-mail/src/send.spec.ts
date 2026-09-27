import { describe, expect, test } from 'bun:test';
import {
	baseOptions,
	partsOf,
	reset,
	signIn,
	verification,
} from '../test/setup';
import { janusMail } from './janus-mail';
import type { JanusMail } from './types';

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
		expect(seen).toEqual({ brand: 'Acme', code: '042817', locale: 'en' });
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

	test('a call without the issued value is a TypeError naming the method', async () => {
		const mail = janusMail(baseOptions());
		const error = await mail.resetPassword(null as never, { name: 'Ada' }).then(
			() => null,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toBe(
			'janusMail.resetPassword: token must be a string',
		);
	});

	/** Each method, called with one field missing, as JavaScript would. */
	const calls: readonly [string, (mail: JanusMail) => Promise<unknown>][] = [
		[
			'janusMail.verifyEmail: token must be a string',
			(m) =>
				m.verifyEmail({ email: 'a@example.com' } as never, { name: 'Ada' }),
		],
		[
			'janusMail.verifyEmail: email must be a string',
			(m) => m.verifyEmail({ token: 't' } as never, { name: 'Ada' }),
		],
		[
			'janusMail.verifyEmail: name must be a string',
			(m) => m.verifyEmail(verification, {} as never),
		],
		[
			'janusMail.resetPassword: email must be a string',
			(m) => m.resetPassword({ token: 't' } as never, { name: 'Ada' }),
		],
		[
			'janusMail.resetPassword: name must be a string',
			(m) => m.resetPassword(reset, {} as never),
		],
		[
			'janusMail.signInCode: email must be a string',
			(m) => m.signInCode({ code: '1' } as never),
		],
		[
			'janusMail.signInCode: code must be a string',
			(m) => m.signInCode({ email: 'a@example.com' } as never),
		],
		[
			'janusMail.passwordChanged: email must be a string',
			(m) => m.passwordChanged({ name: 'Ada' } as never),
		],
		[
			'janusMail.passwordChanged: name must be a string',
			(m) => m.passwordChanged({ email: 'a@example.com' } as never),
		],
		[
			'janusMail.emailChanged: formerEmail must be a string',
			(m) =>
				m.emailChanged({ name: 'Ada', newEmail: 'n@example.com' } as never),
		],
		[
			'janusMail.emailChanged: name must be a string',
			(m) =>
				m.emailChanged({
					formerEmail: 'f@example.com',
					newEmail: 'n@example.com',
				} as never),
		],
		[
			'janusMail.emailChanged: newEmail must be a string',
			(m) =>
				m.emailChanged({ name: 'Ada', formerEmail: 'f@example.com' } as never),
		],
	];

	for (const [message, call] of calls) {
		test(`${message}, and nothing sent`, async () => {
			const options = baseOptions();
			const error = await call(janusMail(options)).then(
				() => null,
				(e: unknown) => e,
			);
			expect(error).toEqual(new TypeError(message));
			expect(options.mailer.attempts).toBe(0);
		});
	}
});

describe('links', () => {
	const unsure = {
		verifyEmail: () => undefined,
		resetPassword: async () => 'https://acme.example/reset',
		secureAccount: () => 42,
	} as never;

	/** Each method, over links that answer no string. */
	const calls: readonly [string, (mail: JanusMail) => Promise<unknown>][] = [
		[
			'janusMail.verifyEmail: links.verifyEmail(token) must answer a string',
			(m) => m.verifyEmail(verification, { name: 'Ada' }),
		],
		[
			'janusMail.resetPassword: links.resetPassword(token) must answer a string',
			(m) => m.resetPassword(reset, { name: 'Ada' }),
		],
		[
			'janusMail.passwordChanged: links.secureAccount() must answer a string',
			(m) => m.passwordChanged({ name: 'Ada', email: 'ada@example.com' }),
		],
		[
			'janusMail.emailChanged: links.secureAccount() must answer a string',
			(m) =>
				m.emailChanged({
					name: 'Ada',
					formerEmail: 'f@example.com',
					newEmail: 'n@example.com',
				}),
		],
	];

	for (const [message, call] of calls) {
		test(`${message}, and nothing sent`, async () => {
			const options = { ...baseOptions(), links: unsure };
			const error = await call(janusMail(options)).then(
				() => null,
				(e: unknown) => e,
			);
			expect(error).toEqual(new TypeError(message));
			expect(options.mailer.attempts).toBe(0);
		});
	}

	test('a mailto: link is sent', async () => {
		const options = baseOptions();
		const mail = janusMail({
			...options,
			links: {
				...options.links,
				secureAccount: () => 'mailto:security@acme.example',
			},
		});
		await mail.passwordChanged({ name: 'Ada', email: 'ada@example.com' });
		expect(options.mailer.sent[0]?.html).toContain(
			'href="mailto:security@acme.example"',
		);
	});

	test('links, from and replyTo changed after janusMail() change nothing', async () => {
		const options = baseOptions();
		const links = { ...options.links };
		const from = { name: 'Acme', address: 'noreply@acme.example' };
		const replyTo = { name: 'Support', address: 'support@acme.example' };
		const mail = janusMail({ ...options, links, from, replyTo });
		(links as { verifyEmail: unknown }).verifyEmail = () => 42;
		from.address = 'attacker@evil.example';
		replyTo.address = 'attacker@evil.example';
		await mail.verifyEmail(verification, { name: 'Ada' });
		const [sent] = options.mailer.sent;
		expect(sent?.from).toEqual({
			name: 'Acme',
			address: 'noreply@acme.example',
		});
		expect(sent?.replyTo).toEqual({
			name: 'Support',
			address: 'support@acme.example',
		});
		expect(sent?.text).toContain(
			'https://acme.example/verify?token=tok-verify-123',
		);
	});

	test('links may be methods of a class instance, keeping their this', async () => {
		class Links {
			readonly base = 'https://acme.example';
			verifyEmail(token: string) {
				return `${this.base}/verify?token=${token}`;
			}
			resetPassword(token: string) {
				return `${this.base}/reset?token=${token}`;
			}
			secureAccount() {
				return `${this.base}/account/security`;
			}
		}
		const options = baseOptions();
		const mail = janusMail({ ...options, links: new Links() });
		await mail.verifyEmail(verification, { name: 'Ada' });
		expect(options.mailer.sent[0]?.text).toContain(
			'https://acme.example/verify?token=tok-verify-123',
		);
	});
});
