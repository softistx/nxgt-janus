# Templates

This page is for changing what an e-mail says or looks like: what a template
is given and answers, replacing some of the twelve, using the defaults on their
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

The sign-in code e-mail is now yours; the eleven others stay the defaults.

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
| `magicLink` | `brand`, `link`, `expiresIn` | `mail.magicLink(issued, to?, options?)` |
| `stepUp` | `brand`, `name`, `code`, `expiresIn`, `link` | `mail.stepUp(issued, to, options?)` |
| `passwordChanged` | `brand`, `name`, `link` | `mail.passwordChanged(to)` |
| `emailChanged` | `brand`, `name`, `link`, `newEmail` | `mail.emailChanged(to)` |
| `twoFactorEnabled` | `brand`, `name`, `link` | `mail.twoFactorEnabled(to)` |
| `twoFactorDisabled` | `brand`, `name`, `link` | `mail.twoFactorDisabled(to)` |
| `recoveryCodeUsed` | `brand`, `name`, `when`, `recoveryCodesLeft`, `link` | `mail.recoveryCodeUsed(to, { when, recoveryCodesLeft })` |
| `newSignIn` | `brand`, `name`, `device`, `location`, `time`, `link` | `mail.newSignIn(to, { device, time, location? })` |
| `welcome` | `brand`, `name`, `link` | `mail.welcome(to)` |

Every one also gets `locale`, one of `locales`. Every value is a string:
`brand` from the options, `name` from the recipient, `link` from `links` —
`links.secureAccount()` for the notices other than `recoveryCodeUsed` and
for `stepUp`, `links.recoveryCodes()` (else
`links.secureAccount()`) for `recoveryCodeUsed`, `links.getStarted()` for
`welcome` — `code`, `newEmail`, `when`, `device` and `time` from the
call, `location` from the call or, without one, "Unknown location" in the
send's locale — "Lieu inconnu" in `fr`, `en`'s text for a locale beyond
the two — and `expiresIn` derived from the flow's `expiresAt` in the locale, or
the send's own `expiresIn` ([Sending](sending.md#the-expiry)).

`recoveryCodesLeft` is a **sentence**, not the count: "You have 9 recovery
codes left." The method writes it from the count with the preset's plural in
the recipient's locale, or passes the send's own text — so an override for
a locale of its own is given what the caller wrote:

```ts
// `escape` is your HTML escaper: a template of yours escapes what it writes.
templates: {
	recoveryCodeUsed: ({ name, when, recoveryCodesLeft, link }) => ({
		subject: 'Ein Wiederherstellungscode wurde verwendet',
		html: `<p>Hallo ${escape(name)}, am ${escape(when)}.</p><p>${escape(recoveryCodesLeft)}</p><p><a href="${escape(link)}">Konto sichern</a></p>`,
		text: `Hallo ${name}, am ${when}.\n\n${recoveryCodesLeft}\n\n${link}`,
	}),
},
// await mail.recoveryCodeUsed(to, { when, recoveryCodesLeft: `Sie haben noch ${left} Wiederherstellungscodes.` });
```

`signInCode` and `stepUp` are **never given the challenge**: it is not in
their variables, and the methods never read it. An override states the expiry from
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
any of the twelve, and the defaults render the rest. Once `locales` holds
another locale, it takes **all twelve** — `stepUp` included, since 0.8, and
`newSignIn`, since 0.9 — see
[Adding a locale](locales.md#adding-a-locale).

`mail.templates` answers the twelve in use — yours, and the defaults for the
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

It answers the twelve defaults, typed for `'en' | 'fr'`, without a mailer:
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
1.1.1, built with a neutral grey theme and no logo:

| Template | Built from | Subject (`en`) | Subject (`fr`) |
| --- | --- | --- | --- |
| `verifyEmail` | `verify-email` | Confirm your e-mail address | Confirmez votre adresse e-mail |
| `resetPassword` | `reset-password` | Reset your password | Réinitialisez votre mot de passe |
| `signInCode` | `sign-in-code` | Your sign-in code: `042817` | Votre code de connexion : `042817` |
| `magicLink` | `magic-link` | Your sign-in link | Votre lien de connexion |
| `stepUp` | `confirm-action` | Your confirmation code | Votre code de confirmation |
| `passwordChanged` | `password-changed` | Your password was changed | Votre mot de passe a été modifié |
| `emailChanged` | `email-changed` | Your e-mail address was changed | Votre adresse e-mail a été modifiée |
| `twoFactorEnabled` | `two-factor-enabled` | Two-factor authentication was turned on | L'authentification à deux facteurs a été activée |
| `twoFactorDisabled` | `two-factor-disabled` | Two-factor authentication was turned off | L'authentification à deux facteurs a été désactivée |
| `recoveryCodeUsed` | `recovery-code-used` | A recovery code was used on your account | Un code de récupération a été utilisé sur votre compte |
| `newSignIn` | `new-sign-in` | New sign-in to your account | Nouvelle connexion à votre compte |
| `welcome` | `welcome` | Welcome, `Ada` | Bienvenue, `Ada` |

Each has a header and a footer with the brand, a heading, a greeting by name
(but `signInCode` and `magicLink`), a button with its link and the link again in text for a
client that shows no button, and a text part. The notices other than `recoveryCodeUsed` add a warning:
*if this was not you, secure your account now*. `stepUp` shows its code as
the sign-in code does, names no action — *someone, we hope you, asked to do
something sensitive on your account* — and warns not to share the code if
it was not the user, its button saying **Secure my account**. `recoveryCodeUsed` says it
too, after a warning banner — *a recovery code was used on your account at
`when`* — the codes left, and a line on generating new ones; its button says
**Secure my account**. `newSignIn` says the account *was signed in from a
device we had not seen*, then a summary of three lines — **Device**,
**Location** and **Time**, *Appareil*, *Lieu* and *Heure* in French — then
*if this was you, there is nothing to do; if this was not you, secure your
account now*, its button saying **Secure my account**; in the text part each
line of the summary is one line, its label then its value — `Device Firefox
on macOS` — with no blank line between rows. `welcome` has the brand in
its heading — "Welcome to Acme" — and the recipient's name in its subject,
filled at send time like the body; its button says **Get started**.

`verifyEmail`, `resetPassword`, `signInCode`, `magicLink` and `stepUp` also
say how long the link or the code lasts: "This link expires in 1 hour.", "Ce code expire dans
10 minutes." The text part keeps each paragraph on one line.

**The HTML follows dark mode.** Each HTML part declares
`color-scheme: light dark`. A client that reads `prefers-color-scheme`, or
Outlook's `[data-ogsc]`, shows a dark page, a dark card and light text to a
reader in dark mode; Gmail always shows the light e-mail. The dark palette
is `@nxgt/mail-ui`'s default, a deep navy, but for the primary: the button
is near-black (`#27272a`) with light text in light mode, and near-white
(`#fafafa`) with near-black text (`#18181b`) in dark mode — 17:1 against the
dark card, where the light primary would be 1.2:1. The page behind the card
is 5% of the light primary over the dark background, a shade darker than the
card, which its border outlines. The code's box — the sign-in code's and the step-up's — is a light grey
(`#f1f5f9`) with near-black code (`#020918`) in light mode, and a slate a
step above the dark card (`#1e293b`) with light code (`#cbd5e1`) in dark
mode, 9.85:1. The muted text — the footer, and the closing *if you did not
ask for this* — is a slate grey (`#5f718a`) in light mode, 4.53:1 on the
page, and turns `#cbd5e1` in dark mode, 12.01:1 on the dark card and
13.31:1 on the page. The notices' alerts keep their light ground and grey
text in both modes, 4.56:1 at the least; the recovery code banner keeps
its light ground and near-black text, 17.57:1. The link under the button is
a blue of each mode's own: `#1d4ed8` on the light card, 6.70:1, and
`#93c5fd` on the dark one, 9.89:1 — `@nxgt/mail-ui` 1.0 gives the info
blue a dark value (`color-info-dark`), where one blue served both modes and
read 2.63:1 on the light card. Every text of the defaults reads at 4.5:1 or
more in both modes. Nothing is passed for any of it,
the text part has no colours, and a template of your own gets none of it. `@nxgt/mail-ui`'s
[Dark mode](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail-ui/docs/guide/dark-mode.md)
guide has the technique, client by client.

**The brand is text.** It is written in the header, the body and the footer,
escaped — no logo and no link, which would need absolute URLs known when the
package is built. A logo takes a template of your own; the
[roadmap](../roadmap.md) has a build of your own brand.

## See also

- [Sending](sending.md) — what each method passes its template.
- [Locales](locales.md) — the `locale` a template is given.
- `@nxgt/mail-presets`' [e-mails guide](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail-presets/docs/guide/emails.md)
  — every message of the defaults, in both locales.
