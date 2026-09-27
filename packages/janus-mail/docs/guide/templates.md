# Templates

This page is for changing what an e-mail says or looks like: what a template
is given and answers, replacing some of the five, using the defaults on their
own, and what the defaults say.

```ts
import { janusMail } from '@nxgt/janus-mail';

const mail = janusMail({
	mailer,
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
	templates: {
		signInCode: ({ brand, code, locale }) => ({
			subject: locale === 'fr' ? `Votre code ${brand} : ${code}` : `Your ${brand} code: ${code}`,
			html: `<p style="font-size:24px;letter-spacing:4px">${code}</p>`,
			text: code,
		}),
	},
});
```

The sign-in code e-mail is now yours; the four others stay the defaults.

## What a template is

```ts
import type { Rendered } from '@nxgt/mail';

type JanusMailTemplate<V, L extends string = 'en' | 'fr'> = (
	variables: V & { readonly locale: L },
) => Rendered | PromiseLike<Rendered>;

interface Rendered {
	readonly subject: string;
	readonly html: string;
	readonly text: string;
}
```

A template is a function: its variables and the locale picked for the
recipient in, the three parts of the e-mail out — synchronously or as a
promise. Anything that answers that shape fits: React Email's `render`, a
template string, another Maizzle build read with `@nxgt/mail/renderer`.

**Escaping is then the template's job.** The defaults escape every value in
the HTML; a template of yours that writes `name` into HTML must escape it
itself — a user's name is free text.

Only `subject`, `html` and `text` are read from what it answers: a `to`, a
`from` or `headers` it adds are ignored, so a template can never redirect an
e-mail.

## What each template is given

`JanusMailVariables`, by template:

| Template | Variables | Sent by |
| --- | --- | --- |
| `verifyEmail` | `brand`, `name`, `link`, `expiresIn` | `mail.verifyEmail(issued, to, options?)` |
| `resetPassword` | `brand`, `name`, `link`, `expiresIn` | `mail.resetPassword(issued, to, options?)` |
| `signInCode` | `brand`, `code`, `expiresIn` | `mail.signInCode(issued, to?, options?)` |
| `passwordChanged` | `brand`, `name`, `link` | `mail.passwordChanged(to)` |
| `emailChanged` | `brand`, `name`, `link`, `newEmail` | `mail.emailChanged(to)` |

Every one also gets `locale`, one of `locales`. Every value is a string:
`brand` from the options, `name` from the recipient, `link` from `links` —
`links.secureAccount()` for the two notices — `code` and `newEmail` from the
call, and `expiresIn` derived from the flow's `expiresAt` in the locale, or
the send's own `expiresIn` ([Sending](sending.md#the-expiry)).

`signInCode` is **never given the challenge**: it is not in its variables,
and the method never reads it. An override states the expiry from
`expiresIn`, already formatted:

```ts
const mail = janusMail({
	mailer, from, brand: 'Acme', links,
	templates: {
		signInCode: ({ code, expiresIn, locale }) =>
			locale === 'fr'
				? { subject: `Code : ${code}`, html: `<p>${code} — valable ${expiresIn}.</p>`, text: `${code} — valable ${expiresIn}.` }
				: { subject: `Code: ${code}`, html: `<p>${code} — valid for ${expiresIn}.</p>`, text: `${code} — valid for ${expiresIn}.` },
	},
});
```

A template that reads a variable its e-mail does not have is a compile error:

```ts
// @ts-expect-error — Property 'name' does not exist: the sign-in code e-mail greets nobody
templates: { signInCode: ({ name }) => rendered },
```

## Some templates, or all of them

`templates` is a plain object, or a class with template fields: a class's
methods live on its prototype and are refused — see
[troubleshooting](../troubleshooting.md#janusmail-templatesname-is-not-an-own-enumerable-property--pass-a-plain-object-as--name-variables--rendered-).

`templates` is `Partial` while `locales` stays within `en` and `fr`: give
any of the five, and the defaults render the rest. Once `locales` holds
another locale, it takes **all five** — see
[Adding a locale](locales.md#adding-a-locale).

`mail.templates` answers the five in use — yours, and the defaults for the
rest — frozen:

```ts
const rendered = await mail.templates.verifyEmail({ brand: 'Acme', name: 'Ada', link, expiresIn: '1 heure', locale: 'fr' });
```

## The defaults alone — `janusTemplates()`

```ts
import { janusTemplates } from '@nxgt/janus-mail';

const defaults = janusTemplates();
const { subject, html, text } = await defaults.resetPassword({
	brand: 'Acme',
	name: 'Ada',
	link: 'https://acme.example/reset?token=abc',
	expiresIn: '1 heure',
	locale: 'fr',
});
```

It answers the five defaults, typed for `'en' | 'fr'`, without a mailer:
to preview an e-mail, to wrap one — add a line to the default text, say — or
to send one through something other than `janusMail()`. A default reused for
a wider set of locales is a compile error: it could not render the one it
lacks.

```ts
import { janusTemplates, type JanusMailTemplates } from '@nxgt/janus-mail';

const defaults = janusTemplates();

// Wrapping a default: the same e-mail, with a line added to its text part.
const templates: Partial<JanusMailTemplates> = {
	verifyEmail: async (variables) => {
		const rendered = await defaults.verifyEmail(variables);
		return { ...rendered, text: `${rendered.text}\n\nAcme — 1 Example Street` };
	},
};
```

The default templates share one renderer, created the first time one of
them renders: that is when the package's `mails/` folder is read, once.

## What the defaults say

The defaults are [`@nxgt/mail-presets`](https://www.npmjs.com/package/@nxgt/mail-presets)
0.2.0, built with a neutral grey theme and no logo:

| Template | Built from | Subject (`en`) | Subject (`fr`) |
| --- | --- | --- | --- |
| `verifyEmail` | `verify-email` | Confirm your e-mail address | Confirmez votre adresse e-mail |
| `resetPassword` | `reset-password` | Reset your password | Réinitialisez votre mot de passe |
| `signInCode` | `sign-in-code` | Your sign-in code: `042817` | Votre code de connexion : `042817` |
| `passwordChanged` | `password-changed` | Your password was changed | Votre mot de passe a été modifié |
| `emailChanged` | `email-changed` | Your e-mail address was changed | Votre adresse e-mail a été modifiée |

Each has a header and a footer with the brand, a heading, a greeting by name
(but `signInCode`), a button with its link and the link again in text for a
client that shows no button, and a text part. The two notices add a warning:
*if this was not you, secure your account now*.

`verifyEmail`, `resetPassword` and `signInCode` also say how long the link
or the code lasts: "This link expires in 1 hour.", "Ce code expire dans
10 minutes." The text part keeps each paragraph on one line.

**The brand is text.** It is written in the header, the body and the footer,
escaped — no logo and no link, which would need absolute URLs known when the
package is built. A logo takes a template of your own; the
[roadmap](../roadmap.md) has a build of your own brand.

## See also

- [Sending](sending.md) — what each method passes its template.
- [Locales](locales.md) — the `locale` a template is given.
- `@nxgt/mail-presets`' [e-mails guide](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail-presets/docs/guide/emails.md)
  — every message of the defaults, in both locales.
