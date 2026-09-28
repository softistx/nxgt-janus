/**
 * The refusals of `janusMail()`'s options, numbered after `send-refusals.ts`'s:
 * each `@ts-expect-error` is one plausible mistake the compiler refuses, and
 * the README counts them with the others. Below them, the options that must
 * keep compiling — among them adding a language with every template.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import { createMemoryMailer, type Rendered } from '@nxgt/mail';
import {
	type JanusMailTemplates,
	janusMail,
	janusTemplates,
} from '../../src/index';

declare const rendered: Rendered;

const mailer = createMemoryMailer();
const links = {
	verifyEmail: (token: string) => `https://acme.example/verify?token=${token}`,
	resetPassword: (token: string) => `https://acme.example/reset?token=${token}`,
	secureAccount: () => 'https://acme.example/account/security',
	getStarted: () => 'https://acme.example/start',
};
const mail = janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
});

// ── The refusals ────────────────────────────────────────────────────────────

// 9. links without secureAccount, which the notices link to.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	// @ts-expect-error
	links: {
		verifyEmail: links.verifyEmail,
		resetPassword: links.resetPassword,
		getStarted: links.getStarted,
	},
});

// 10. A link given as a URL rather than a function of the token.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	// @ts-expect-error
	links: { ...links, verifyEmail: 'https://acme.example/verify' },
});

// 11. brand given as mail-ui's brand object rather than its name.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	// @ts-expect-error
	brand: { name: 'Acme' },
	links,
});

// 12. A template that answers a string rather than { subject, html, text }.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
	// @ts-expect-error
	templates: { signInCode: ({ code }) => `Your code is ${code}` },
});

// 13. A template that reads a variable its e-mail does not have.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
	// @ts-expect-error
	templates: { signInCode: ({ name }) => ({ ...rendered, subject: name }) },
});

// 14. A template for an e-mail the package does not send.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
	// @ts-expect-error
	templates: { magicLink: () => rendered },
});

// 15. A fallbackLocale outside locales.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
	locales: ['en', 'fr'],
	// @ts-expect-error
	fallbackLocale: 'de',
});

// 16. A locale beyond en and fr with only some templates: the defaults cannot render it.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
	locales: ['en', 'fr', 'de'],
	// @ts-expect-error
	templates: { verifyEmail: () => rendered },
});

// 17. A default template reused for a locale it is not built in.
const defaults = janusTemplates();
const wide: JanusMailTemplates<'en' | 'fr' | 'de'> = {
	// @ts-expect-error
	verifyEmail: defaults.verifyEmail,
	resetPassword: () => rendered,
	signInCode: () => rendered,
	passwordChanged: () => rendered,
	emailChanged: () => rendered,
	twoFactorEnabled: () => rendered,
	twoFactorDisabled: () => rendered,
	welcome: () => rendered,
};

// 18. A template that does not exist, read from what janusMail answered.
// @ts-expect-error
void mail.templates.magicLink;

// 19. A link computed asynchronously: the e-mail needs the string now.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		...links,
		// @ts-expect-error
		verifyEmail: async (token: string) => links.verifyEmail(token),
	},
});

// 20. A link answered as a URL object rather than its href.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		...links,
		// @ts-expect-error
		secureAccount: () => new URL('https://acme.example/account'),
	},
});

// ── What must keep compiling ────────────────────────────────────────────────

// A partial override, async, reading the locale.
janusMail({
	mailer,
	from: { name: 'Acme', address: 'noreply@acme.example' },
	replyTo: 'support@acme.example',
	brand: 'Acme',
	links,
	fallbackLocale: 'fr',
	templates: {
		signInCode: async ({ code, locale }) => ({
			subject: locale === 'fr' ? `Code : ${code}` : `Code: ${code}`,
			html: `<p>${code}</p>`,
			text: code,
		}),
	},
});

// Fewer locales than built: the defaults still fit, partial templates too.
const english = janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
	locales: ['en'],
});
const onlyEnglish: readonly 'en'[] = english.locales;

// Adding a language: every template, for every locale.
const german = janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
	locales: ['en', 'fr', 'de'],
	fallbackLocale: 'de',
	templates: {
		...wide,
		verifyEmail: ({ locale }) => ({ ...rendered, subject: locale }),
	},
});
const withGerman: readonly ('en' | 'fr' | 'de')[] = german.locales;

void onlyEnglish;
void withGerman;
