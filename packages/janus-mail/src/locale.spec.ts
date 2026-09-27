import { describe, expect, test } from 'bun:test';
import { parseAcceptLanguage } from '@nxgt/mail';
import { baseOptions, signIn, verification } from '../test/setup';
import { janusMail } from './janus-mail';

/** The `lang` of the one e-mail `options.mailer` sent. */
function langOf(options: ReturnType<typeof baseOptions>): string | undefined {
	return /<html lang="([^"]+)"/.exec(options.mailer.sent[0]?.html ?? '')?.[1];
}

describe('the locale of an e-mail is the recipient’s', () => {
	test('fr-CA sends fr: a region not built matches its language', async () => {
		const options = baseOptions();
		await janusMail(options).verifyEmail(verification, {
			name: 'Ada',
			locale: 'fr-CA',
		});
		expect(langOf(options)).toBe('fr');
	});

	test('null sends the fallback locale', async () => {
		const options = baseOptions();
		await janusMail(options).verifyEmail(verification, {
			name: 'Ada',
			locale: null,
		});
		expect(langOf(options)).toBe('en');
	});

	test('no locale at all sends the fallback locale', async () => {
		const options = baseOptions();
		await janusMail(options).signInCode(signIn);
		expect(langOf(options)).toBe('en');
	});

	test('a locale not built sends the fallback locale', async () => {
		const options = baseOptions();
		await janusMail(options).signInCode(signIn, { locale: 'de' });
		expect(langOf(options)).toBe('en');
	});

	test('an Accept-Language list sends the first locale built', async () => {
		const options = baseOptions();
		await janusMail(options).signInCode(signIn, {
			locale: [
				null,
				...parseAcceptLanguage('de-DE,de;q=0.9,fr;q=0.8,en;q=0.5'),
			],
		});
		expect(langOf(options)).toBe('fr');
	});

	test('fallbackLocale changes where nothing matches', async () => {
		const options = { ...baseOptions(), fallbackLocale: 'fr' as const };
		await janusMail(options).signInCode(signIn, { locale: 'de' });
		expect(langOf(options)).toBe('fr');
	});

	test('locales narrows what is sent: fr is not sent when only en is', async () => {
		const options = { ...baseOptions(), locales: ['en'] as const };
		const mail = janusMail(options);
		expect(mail.locales).toEqual(['en']);
		await mail.signInCode(signIn, { locale: 'fr' });
		expect(langOf(options)).toBe('en');
	});
});
