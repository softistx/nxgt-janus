/**
 * Type safety, measured: each `@ts-expect-error` below is one plausible
 * mistake the compiler refuses, and fails the typecheck the moment it stops
 * being refused. The README counts them. Below them, the calls that must keep
 * compiling: a refusal that also refuses the right call is a bug.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import type { IssuedCode, IssuedToken } from '@nxgt/janus';
import { createMemoryMailer, type Rendered } from '@nxgt/mail';
import {
	type JanusMailTemplates,
	janusMail,
	janusTemplates,
	type Recipient,
} from '../../src/index';

declare const issuedToken: IssuedToken;
declare const issuedCode: IssuedCode<{ id: string }>;
declare const maybeReset: (IssuedToken & { user: { id: string } }) | null;
declare const rendered: Rendered;

const mailer = createMemoryMailer();
const links = {
	verifyEmail: (token: string) => `https://acme.example/verify?token=${token}`,
	resetPassword: (token: string) => `https://acme.example/reset?token=${token}`,
	secureAccount: () => 'https://acme.example/account/security',
};
const mail = janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
});
const ada: Recipient = { name: 'Ada', locale: 'fr-CA' };

// ── The refusals ────────────────────────────────────────────────────────────

// 1. A sign-in code given to verifyEmail: it has no token.
// @ts-expect-error
await mail.verifyEmail(issuedCode, ada);

// 2. A one-time token given to signInCode: it has no code.
// @ts-expect-error
await mail.signInCode(issuedToken);

// 3. resetPassword.request's answer, not checked for null first.
// @ts-expect-error
await mail.resetPassword(maybeReset, ada);

// 4. verifyEmail without the recipient: the e-mail greets them by name.
// @ts-expect-error
await mail.verifyEmail(issuedToken);

// 5. A recipient without a name.
// @ts-expect-error
await mail.resetPassword(issuedToken, { locale: 'fr' });

// 6. passwordChanged without the address to tell.
// @ts-expect-error
await mail.passwordChanged({ name: 'Ada' });

// 7. emailChanged without the former address, which is where it goes.
// @ts-expect-error
await mail.emailChanged({ name: 'Ada', newEmail: 'ada@new.example' });

// 8. A locale that is not a locale.
// @ts-expect-error
await mail.signInCode(issuedCode, { locale: 33 });

// 9. links without secureAccount, which the two notices link to.
janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	// @ts-expect-error
	links: { verifyEmail: links.verifyEmail, resetPassword: links.resetPassword },
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
	templates: { welcome: () => rendered },
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
};

// 18. A template that does not exist, read from what janusMail answered.
// @ts-expect-error
void mail.templates.welcome;

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

// Every flow's answer, as the flows give it.
await mail.verifyEmail(issuedToken, ada);
if (maybeReset !== null) await mail.resetPassword(maybeReset, ada);
await mail.signInCode(issuedCode); // the whole IssuedCode: only code and email are read
await mail.signInCode(issuedCode, { locale: ['fr-CA', 'en'] });
await mail.signInCode(issuedCode, ada); // a recipient with a name: the name is not used
await mail.passwordChanged({
	name: 'Ada',
	email: 'ada@example.com',
	locale: null,
});
await mail.emailChanged({
	...ada,
	formerEmail: 'ada@example.com',
	newEmail: 'ada@new.example',
});

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
