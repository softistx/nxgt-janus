import { describe, expect, test } from 'bun:test';
import { baseOptions } from '../test/setup';
import { janusMail } from './janus-mail';

/** `janusMail()` called with the base options changed by `patch`, as JavaScript would. */
function wire(patch: Record<string, unknown>): () => unknown {
	return () => janusMail({ ...baseOptions(), ...patch } as never);
}

const cases: readonly [string, Record<string, unknown>, string][] = [
	[
		'no mailer',
		{ mailer: undefined },
		'mailer must be a Mailer — an object with a send function',
	],
	[
		'a mailer without send',
		{ mailer: {} },
		'mailer must be a Mailer — an object with a send function',
	],
	[
		'no from',
		{ from: undefined },
		"from must be an address, as 'noreply@example.com' or { name, address }",
	],
	[
		'an empty from',
		{ from: ' ' },
		"from must be an address, as 'noreply@example.com' or { name, address }",
	],
	[
		'a from without its address',
		{ from: { name: 'Acme' } },
		"from must be an address, as 'noreply@example.com' or { name, address }",
	],
	[
		'a replyTo that is not an address',
		{ replyTo: 42 },
		"replyTo must be an address, as 'support@example.com' or { name, address }",
	],
	[
		'no brand',
		{ brand: undefined },
		"brand must be the name the e-mails show, as 'Acme'",
	],
	[
		'a blank brand',
		{ brand: '  ' },
		"brand must be the name the e-mails show, as 'Acme'",
	],
	[
		'no links',
		{ links: undefined },
		'links must be an object, as { verifyEmail, resetPassword, secureAccount, getStarted }',
	],
	[
		'a link given as a URL',
		{
			links: {
				...baseOptions().links,
				verifyEmail: 'https://acme.example/verify',
			},
		},
		'links.verifyEmail must be a function',
	],
	[
		'a link missing',
		{ links: { verifyEmail: () => '', secureAccount: () => '' } },
		'links.resetPassword must be a function',
	],
	[
		'secureAccount missing',
		{ links: { verifyEmail: () => '', resetPassword: () => '' } },
		'links.secureAccount must be a function',
	],
	[
		'getStarted missing — links written before welcome',
		{
			links: {
				verifyEmail: () => '',
				resetPassword: () => '',
				secureAccount: () => '',
			},
		},
		'links.getStarted must be a function',
	],
	[
		'empty locales',
		{ locales: [] },
		"locales must list at least one locale, as ['en', 'fr']",
	],
	[
		'locales as a string',
		{ locales: 'en' },
		"locales must list at least one locale, as ['en', 'fr']",
	],
	[
		'a locale with an underscore',
		{ locales: ['en', 'de_DE'] },
		"locales must be BCP 47 language tags, as 'fr-CA'",
	],
	[
		'a grandfathered tag Intl refuses',
		{ locales: ['i-klingon'] },
		"locales must be BCP 47 language tags, as 'fr-CA'",
	],
	[
		'a bare private-use tag Intl refuses',
		{ locales: ['x-foo'] },
		"locales must be BCP 47 language tags, as 'fr-CA'",
	],
	[
		'a locale twice',
		{ locales: ['en', 'en'] },
		'locales holds the same locale twice',
	],
	[
		'a fallbackLocale outside locales',
		{ fallbackLocale: 'de' },
		'fallbackLocale must be one of locales',
	],
	[
		'templates as a list',
		{ templates: [] },
		'templates must be an object of functions, as { verifyEmail: (variables) => rendered }',
	],
	[
		'a template that is not one',
		{ templates: { magicLink: () => null } },
		'templates has no template magicLink — name one of verifyEmail, resetPassword, signInCode, passwordChanged, emailChanged, twoFactorEnabled, twoFactorDisabled, welcome',
	],
	[
		'a template that is not a function',
		{ templates: { signInCode: 'code' } },
		'templates.signInCode must be a function',
	],
];

describe('wiring', () => {
	test('options that are not an object', () => {
		expect(() => janusMail(undefined as never)).toThrow(
			new TypeError(
				'janusMail: options must be an object, as { mailer, from, brand, links }',
			),
		);
	});

	for (const [what, patch, message] of cases) {
		test(`${what} is a TypeError`, () => {
			expect(wire(patch)).toThrow(new TypeError(`janusMail: ${message}`));
		});
	}

	test('a refused locale is not named in the message', () => {
		let caught: unknown;
		try {
			wire({ locales: ['en', 'de_DE'] })();
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(TypeError);
		expect((caught as Error).message).not.toContain('de_DE');
	});

	test('a bad option throws a bare TypeError, not a subclass', () => {
		let caught: unknown;
		try {
			wire({ brand: '' })();
		} catch (error) {
			caught = error;
		}
		expect(Object.getPrototypeOf(caught)).toBe(TypeError.prototype);
	});

	test('the object it answers is frozen', () => {
		const mail = janusMail(baseOptions());
		expect(Object.isFrozen(mail)).toBe(true);
		expect(Object.isFrozen(mail.templates)).toBe(true);
		expect(Object.isFrozen(mail.locales)).toBe(true);
		expect(mail.locales).toEqual(['en', 'fr']);
	});
});
