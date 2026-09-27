import { describe, expect, test } from 'bun:test';
import type { Rendered } from '@nxgt/mail';
import { baseOptions, signIn, verification } from '../test/setup';
import { janusMail } from './janus-mail';
import { janusTemplates } from './templates';
import type { JanusMailTemplates } from './types';

const plain = (subject: string): Rendered => ({
	subject,
	html: `<p>${subject}</p>`,
	text: subject,
});

describe('templates', () => {
	test('a partial override replaces its e-mail and keeps the defaults for the rest', async () => {
		const options = baseOptions();
		const mail = janusMail({
			...options,
			templates: { signInCode: ({ code }) => plain(`Code ${code}`) },
		});
		await mail.signInCode(signIn);
		await mail.verifyEmail(verification, { name: 'Ada' });
		const [code, verify] = options.mailer.sent;
		expect(code?.subject).toBe('Code 042817');
		expect(verify?.subject).toBe('Confirm your e-mail address');
		expect(mail.templates.verifyEmail).toBeFunction();
	});

	test('an override is given the locale picked for the recipient', async () => {
		const options = baseOptions();
		const seen: string[] = [];
		const mail = janusMail({
			...options,
			templates: {
				verifyEmail: ({ locale, name }) => {
					seen.push(locale);
					return plain(locale === 'fr' ? `Bonjour ${name}` : `Hello ${name}`);
				},
			},
		});
		await mail.verifyEmail(verification, { name: 'Ada', locale: 'fr-BE' });
		expect(seen).toEqual(['fr']);
		expect(options.mailer.sent[0]?.subject).toBe('Bonjour Ada');
	});

	test('an override may be async', async () => {
		const options = baseOptions();
		const mail = janusMail({
			...options,
			templates: {
				passwordChanged: async ({ link }) => {
					await Promise.resolve();
					return plain(`Changed — ${link}`);
				},
			},
		});
		await mail.passwordChanged({ name: 'Ada', email: 'ada@example.com' });
		expect(options.mailer.sent[0]?.subject).toBe(
			'Changed — https://acme.example/account/security',
		);
	});

	test('a locale beyond en and fr without every template is a TypeError', () => {
		expect(() =>
			janusMail({
				...baseOptions(),
				locales: ['en', 'fr', 'de'],
				// A cast, as a JavaScript caller would: the compiler refuses this call.
				templates: { verifyEmail: () => plain('Hallo') } as never,
			}),
		).toThrow(
			new TypeError(
				'janusMail: the default templates are built in en and fr only — with another ' +
					'locale in locales, pass every template in templates; resetPassword, ' +
					'signInCode, passwordChanged, emailChanged missing',
			),
		);
	});

	// Every template is a method of the class, none an own property: none would
	// be copied, so none may count as given — with a wider locale set, or with
	// the default one, where the defaults would be sent in their place.
	class Templates {
		verifyEmail() {
			return plain('Hallo');
		}
		resetPassword() {
			return plain('Hallo');
		}
		signInCode() {
			return plain('Hallo');
		}
		passwordChanged() {
			return plain('Hallo');
		}
		emailChanged() {
			return plain('Hallo');
		}
	}
	const inherited = new TypeError(
		'janusMail: templates.verifyEmail is not an own property — pass a plain object, ' +
			'as { verifyEmail: (variables) => rendered }',
	);

	test('a template on a prototype is refused with a locale beyond en and fr', () => {
		expect(() =>
			janusMail({
				...baseOptions(),
				locales: ['en', 'fr', 'de'],
				templates: new Templates(),
			}),
		).toThrow(inherited);
	});

	test('a template on a prototype is refused with the default locales too', () => {
		expect(() =>
			janusMail({ ...baseOptions(), templates: new Templates() }),
		).toThrow(inherited);
	});

	test('a class instance with its templates as own properties is accepted', async () => {
		class Own {
			readonly signInCode = ({ code }: { code: string }) =>
				plain(`Code ${code}`);
		}
		const options = baseOptions();
		await janusMail({ ...options, templates: new Own() }).signInCode(signIn);
		expect(options.mailer.sent[0]?.subject).toBe('Code 042817');
	});

	test('a locale beyond en and fr works once every template is given', async () => {
		const options = baseOptions();
		const own =
			(subject: string) =>
			({ locale }: { locale: string }) =>
				plain(`${subject} (${locale})`);
		const templates: JanusMailTemplates<'en' | 'fr' | 'de'> = {
			verifyEmail: own('verify'),
			resetPassword: own('reset'),
			signInCode: own('code'),
			passwordChanged: own('changed'),
			emailChanged: own('email'),
		};
		const mail = janusMail({
			...options,
			locales: ['en', 'fr', 'de'],
			templates,
		});
		await mail.signInCode(signIn, { locale: 'de-AT' });
		expect(options.mailer.sent[0]?.subject).toBe('code (de)');
		expect(mail.locales).toEqual(['en', 'fr', 'de']);
	});

	test('janusTemplates() renders the defaults alone', async () => {
		const rendered = await janusTemplates().signInCode({
			brand: 'Acme',
			code: '123456',
			locale: 'fr',
		});
		expect(rendered.subject).toBe('Votre code de connexion : 123456');
		expect(rendered.text).toContain('Acme');
	});
});
