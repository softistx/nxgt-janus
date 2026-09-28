import { describe, expect, test } from 'bun:test';
import { baseOptions, reset, verification } from '../test/setup';
import { janusMail } from './janus-mail';
import type { JanusMail } from './types';

describe('a field missing from a call', () => {
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
			'janusMail.twoFactorEnabled: email must be a string',
			(m) => m.twoFactorEnabled({ name: 'Ada' } as never),
		],
		[
			'janusMail.twoFactorDisabled: name must be a string',
			(m) => m.twoFactorDisabled({ email: 'a@example.com' } as never),
		],
		[
			'janusMail.welcome: email must be a string',
			(m) => m.welcome({ name: 'Ada' } as never),
		],
		[
			'janusMail.welcome: name must be a string',
			(m) => m.welcome({ email: 'a@example.com' } as never),
		],
		[
			'janusMail.recoveryCodeUsed: email must be a string',
			(m) =>
				m.recoveryCodeUsed({ name: 'Ada' } as never, {
					when: 'now',
					recoveryCodesLeft: 9,
				}),
		],
		[
			'janusMail.recoveryCodeUsed: when must be a string',
			(m) =>
				m.recoveryCodeUsed({ name: 'Ada', email: 'a@example.com' }, {
					when: new Date(),
					recoveryCodesLeft: 9,
				} as never),
		],
		[
			'janusMail.recoveryCodeUsed: when must be a string',
			(m) =>
				m.recoveryCodeUsed(
					{ name: 'Ada', email: 'a@example.com' },
					undefined as never,
				),
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
