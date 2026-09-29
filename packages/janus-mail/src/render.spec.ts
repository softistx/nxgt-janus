import { describe, expect, test } from 'bun:test';
import type { SentMail } from '@nxgt/mail';
import {
	baseOptions,
	partsOf,
	reset,
	signIn,
	signInLink,
	stepUp,
	verification,
} from '../test/setup';
import { janusMail } from './janus-mail';
import type { JanusMail, JanusMailTemplateName } from './types';

const name = 'Ada <3';

/** Sends one e-mail of each template, to a recipient who wants `locale`. */
const sends: Record<
	JanusMailTemplateName,
	(mail: JanusMail, locale: string) => Promise<SentMail>
> = {
	verifyEmail: (mail, locale) =>
		mail.verifyEmail(verification, { name, locale }),
	resetPassword: (mail, locale) => mail.resetPassword(reset, { name, locale }),
	signInCode: (mail, locale) => mail.signInCode(signIn, { locale }),
	magicLink: (mail, locale) => mail.magicLink(signInLink, { locale }),
	stepUp: (mail, locale) => mail.stepUp(stepUp, { name, locale }),
	passwordChanged: (mail, locale) =>
		mail.passwordChanged({ name, locale, email: 'ada@example.com' }),
	emailChanged: (mail, locale) =>
		mail.emailChanged({
			name,
			locale,
			formerEmail: 'ada@example.com',
			newEmail: 'ada@new.example',
		}),
	twoFactorEnabled: (mail, locale) =>
		mail.twoFactorEnabled({ name, locale, email: 'ada@example.com' }),
	twoFactorDisabled: (mail, locale) =>
		mail.twoFactorDisabled({ name, locale, email: 'ada@example.com' }),
	recoveryCodeUsed: (mail, locale) =>
		mail.recoveryCodeUsed(
			{ name, locale, email: 'ada@example.com' },
			{ when: '28/09/2026 14:05', recoveryCodesLeft: 9 },
		),
	newSignIn: (mail, locale) =>
		mail.newSignIn(
			{ name, locale, email: 'ada@example.com' },
			{ device: 'Firefox on macOS', time: '29/09/2026 09:12' },
		),
	welcome: (mail, locale) =>
		mail.welcome({ name, locale, email: 'ada@example.com' }),
};

const subjects: Record<JanusMailTemplateName, { en: string; fr: string }> = {
	verifyEmail: {
		en: 'Confirm your e-mail address',
		fr: 'Confirmez votre adresse e-mail',
	},
	resetPassword: {
		en: 'Reset your password',
		fr: 'Réinitialisez votre mot de passe',
	},
	// A no-break space before the colon, as French typography writes it.
	signInCode: {
		en: 'Your sign-in code: 042817',
		fr: 'Votre code de connexion\u00a0: 042817',
	},
	magicLink: {
		en: 'Your sign-in link',
		fr: 'Votre lien de connexion',
	},
	stepUp: {
		en: 'Your confirmation code',
		fr: 'Votre code de confirmation',
	},
	passwordChanged: {
		en: 'Your password was changed',
		fr: 'Votre mot de passe a été modifié',
	},
	emailChanged: {
		en: 'Your e-mail address was changed',
		fr: 'Votre adresse e-mail a été modifiée',
	},
	twoFactorEnabled: {
		en: 'Two-factor authentication was turned on',
		fr: "L'authentification à deux facteurs a été activée",
	},
	twoFactorDisabled: {
		en: 'Two-factor authentication was turned off',
		fr: "L'authentification à deux facteurs a été désactivée",
	},
	recoveryCodeUsed: {
		en: 'A recovery code was used on your account',
		fr: 'Un code de récupération a été utilisé sur votre compte',
	},
	newSignIn: {
		en: 'New sign-in to your account',
		fr: 'Nouvelle connexion à votre compte',
	},
	// The one subject with a placeholder: the name, written as is.
	welcome: {
		en: 'Welcome, Ada <3',
		fr: 'Bienvenue, Ada <3',
	},
};

/** A line break after a colon, before a line that is an address alone. */
const ADDRESS_LINE = /:\n(?=(?:https?:\/\/|mailto:)\S+$)/gm;

/**
 * `newSignIn`'s summary in the text part, as `sends` sends it — no location
 * given: one row per line, "Label value", no blank line between.
 */
const SUMMARY_ROWS = {
	en: [
		'Device Firefox on macOS',
		'Location Unknown location',
		'Time 29/09/2026 09:12',
	],
	fr: [
		'Appareil Firefox on macOS',
		'Lieu Lieu inconnu',
		'Heure 29/09/2026 09:12',
	],
} as const;

describe('the default e-mails', () => {
	for (const template of Object.keys(sends) as JanusMailTemplateName[]) {
		for (const locale of ['en', 'fr'] as const) {
			test(`${template} in ${locale}: every placeholder filled, the brand in it`, async () => {
				const options = baseOptions();
				await sends[template](janusMail(options), locale);
				const [sent] = options.mailer.sent;
				expect(sent?.subject).toBe(subjects[template][locale]);
				for (const part of partsOf(sent)) expect(part).not.toContain('{{');
				expect(sent?.html).toContain(`lang="${locale}"`);
				expect(sent?.html).toContain('Acme');
				expect(sent?.text).toContain('Acme');
			});
		}
	}

	test('the text part breaks between paragraphs only, never mid-sentence', async () => {
		for (const template of Object.keys(sends) as JanusMailTemplateName[]) {
			for (const locale of ['en', 'fr'] as const) {
				const options = baseOptions();
				await sends[template](janusMail(options), locale);
				const text = options.mailer.sent[0]?.text ?? '';
				for (const paragraph of text.trim().split('\n\n')) {
					// The summary's rows are lines of one paragraph, checked below.
					if (template === 'newSignIn' && paragraph.includes('\n')) continue;
					// An address may sit on its own line after its sentence's colon.
					expect(paragraph.replace(ADDRESS_LINE, ': ')).not.toContain('\n');
				}
			}
		}
	});

	for (const locale of ['en', 'fr'] as const) {
		test(`newSignIn in ${locale}: each summary row is its label and its value on one line`, async () => {
			const options = baseOptions();
			await sends.newSignIn(janusMail(options), locale);
			const text = options.mailer.sent[0]?.text ?? '';
			const multiline = text
				.trim()
				.split('\n\n')
				.filter((paragraph) => paragraph.includes('\n'));
			expect(multiline).toEqual([SUMMARY_ROWS[locale].join('\n')]);
		});
	}

	test('the fallback link is its sentence, then the address after its colon', async () => {
		const options = baseOptions();
		await janusMail(options).magicLink(signInLink);
		const text = options.mailer.sent[0]?.text ?? '';
		// A space or a line break: upstream keeps an address on its own line.
		expect(text).toMatch(
			/If the button does not work, open this link:[ \n]https:\/\/acme\.example\/sign-in\/link\?token=tok-link-789\n/,
		);
	});

	test('a value is HTML-escaped in the html, and written as is in the text', async () => {
		const options = baseOptions();
		await janusMail(options).verifyEmail(verification, { name });
		const [sent] = options.mailer.sent;
		expect(sent?.html).toContain('Ada &lt;3');
		expect(sent?.html).not.toContain('Ada <3');
		expect(sent?.text).toContain('Ada <3');
	});

	test('the brand is text: markup in it is escaped, never rendered', async () => {
		const options = { ...baseOptions(), brand: '<b>Acme</b> & co' };
		await janusMail(options).signInCode(signIn);
		const [sent] = options.mailer.sent;
		expect(sent?.html).toContain('&lt;b&gt;Acme&lt;/b&gt; &amp; co');
		expect(sent?.html).not.toContain('<b>Acme</b>');
		expect(sent?.text).toContain('<b>Acme</b> & co');
	});

	test('each link is the one `links` made from the issued token', async () => {
		const options = baseOptions();
		const mail = janusMail(options);
		await mail.verifyEmail(verification, { name: 'Ada' });
		await mail.resetPassword(reset, { name: 'Ada' });
		await mail.passwordChanged({ name: 'Ada', email: 'ada@example.com' });
		await mail.twoFactorEnabled({ name: 'Ada', email: 'ada@example.com' });
		await mail.twoFactorDisabled({ name: 'Ada', email: 'ada@example.com' });
		await mail.welcome({ name: 'Ada', email: 'ada@example.com' });
		const [verify, resetMail, changed, enabled, disabled, welcome] =
			options.mailer.sent;
		expect(verify?.html).toContain(
			'https://acme.example/verify?token=tok-verify-123',
		);
		expect(verify?.text).toContain(
			'https://acme.example/verify?token=tok-verify-123',
		);
		expect(resetMail?.text).toContain(
			'https://acme.example/reset?token=tok-reset-456',
		);
		for (const notice of [changed, enabled, disabled]) {
			expect(notice?.text).toContain('https://acme.example/account/security');
			expect(notice?.html).toContain('https://acme.example/account/security');
		}
		expect(welcome?.text).toContain('https://acme.example/start');
		expect(welcome?.html).toContain('https://acme.example/start');
		expect(welcome?.html).not.toContain(
			'https://acme.example/account/security',
		);
	});

	test('the new address is in the e-mail-changed e-mail', async () => {
		const options = baseOptions();
		await janusMail(options).emailChanged({
			name: 'Ada',
			formerEmail: 'ada@example.com',
			newEmail: 'ada@new.example',
		});
		expect(options.mailer.sent[0]?.text).toContain('ada@new.example');
	});
});
