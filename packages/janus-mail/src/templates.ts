/**
 * The default templates: the prebuilt e-mails, filled by `@nxgt/mail`'s
 * renderer. Each picks from its variables exactly what its e-mail takes — the
 * renderer refuses a variable too many — so the `locale` beside them goes to
 * the renderer's options, and nowhere else.
 */
import type { Rendered } from '@nxgt/mail';
import { defaultRenderer } from './mails';
import type { JanusMailTemplates } from './types';

/**
 * The nine default templates, in the locales they are built in. The
 * renderer behind them is created on the first render, not here.
 *
 * ```ts
 * const defaults = janusTemplates();
 * const { subject } = await defaults.verifyEmail({ brand: 'Acme', name: 'Ada', link, locale: 'fr' });
 * ```
 *
 * A URL that is not `http:`, `https:` or `mailto:` throws `MailRefused`; a
 * missing `mails/` folder throws when the first one renders.
 */
export function janusTemplates(): JanusMailTemplates {
	return Object.freeze({
		verifyEmail: ({ brand, name, link, expiresIn, locale }): Rendered =>
			defaultRenderer().render(
				'verify-email',
				{ brand, name, link, expiresIn },
				{ locale },
			),
		resetPassword: ({ brand, name, link, expiresIn, locale }): Rendered =>
			defaultRenderer().render(
				'reset-password',
				{ brand, name, link, expiresIn },
				{ locale },
			),
		signInCode: ({ brand, code, expiresIn, locale }): Rendered =>
			defaultRenderer().render(
				'sign-in-code',
				{ brand, code, expiresIn },
				{ locale },
			),
		passwordChanged: ({ brand, name, link, locale }): Rendered =>
			defaultRenderer().render(
				'password-changed',
				{ brand, name, link },
				{ locale },
			),
		emailChanged: ({ brand, name, link, newEmail, locale }): Rendered =>
			defaultRenderer().render(
				'email-changed',
				{ brand, name, link, newEmail },
				{ locale },
			),
		twoFactorEnabled: ({ brand, name, link, locale }): Rendered =>
			defaultRenderer().render(
				'two-factor-enabled',
				{ brand, name, link },
				{ locale },
			),
		twoFactorDisabled: ({ brand, name, link, locale }): Rendered =>
			defaultRenderer().render(
				'two-factor-disabled',
				{ brand, name, link },
				{ locale },
			),
		recoveryCodeUsed: ({
			brand,
			name,
			when,
			recoveryCodesLeft,
			link,
			locale,
		}): Rendered =>
			defaultRenderer().render(
				'recovery-code-used',
				{ brand, name, when, recoveryCodesLeft, link },
				{ locale },
			),
		welcome: ({ brand, name, link, locale }): Rendered =>
			defaultRenderer().render('welcome', { brand, name, link }, { locale }),
	});
}
