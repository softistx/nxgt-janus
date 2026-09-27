import { describe, expect, test } from 'bun:test';
import { baseOptions, reset, verification } from '../test/setup';
import { janusMail } from './janus-mail';
import type { JanusMail } from './types';

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
