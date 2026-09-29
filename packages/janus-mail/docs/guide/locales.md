# Locales

This page is for sending in the recipient's language: how the locale of each
e-mail is picked, what `locales` and `fallbackLocale` change, and how to add a
language the defaults are not built in.

```ts
import { parseAcceptLanguage } from '@nxgt/mail';

await mail.verifyEmail(issued, {
	name: user.name,
	locale: [user.locale, ...parseAcceptLanguage(request.headers.get('accept-language'))],
});
// user.locale 'fr-CA' → fr; null, with 'de,en;q=0.8' → en; nothing matching → the fallback
```

## How the locale is picked

Each method passes `to.locale` to `@nxgt/mail`'s `pickLocale`, with
`locales` and `fallbackLocale`:

1. For each wanted locale, in order, an exact match wins (case, `_` and `-`
   do not matter), then a match on the language: `fr-CA` sends `fr`.
2. Nothing matching — or `null`, `undefined`, an empty list — sends
   `fallbackLocale`.

`to.locale` is a `WantedLocales`: a string, `null`, `undefined`, or a list of
them, most wanted first. **The locale is the recipient's**, not the
request's: an administrator who resets a user's password sends in the
*user's* locale. Put their stored locale first, and the visitor's
`Accept-Language` after it only when the recipient is the visitor.

| `to.locale` | Sent in |
| --- | --- |
| `'fr'`, `'fr-CA'`, `'FR_be'` | `fr` |
| `'en-GB'` | `en` |
| `'de'` | the fallback, `en` |
| `null`, `undefined`, `[]` | the fallback |
| `[null, 'de-DE', 'fr']` | `fr` |

The template is given the locale picked — `'fr'`, never `'fr-CA'` — so an
override can branch on it.

## `locales` and `fallbackLocale`

| Option | Default | Effect |
| --- | --- | --- |
| `locales` | `['en', 'fr']`, the built ones | The locales an e-mail can be sent in. Its type is inferred as written: `['en']` makes `L` `'en'` |
| `fallbackLocale` | `'en'` when in `locales`, else the first of them | Sent when the recipient wants none of `locales`. Must be one of them: another is a compile error, and a `TypeError` |

Each locale must be a BCP 47 tag — `fr-CA`, never `fr_CA` — and `janusMail()`
refuses anything else with a `TypeError`:
[`janusMail: locales must be BCP 47 language tags, as 'fr-CA'`](../troubleshooting.md#janusmail-locales-must-be-bcp-47-language-tags-as-fr-ca).

**Fewer locales.** `locales: ['en']` sends English to everyone, a French
speaker included; the defaults still fit, and `templates` stays partial.

```ts
const mail = janusMail({ mailer, from, brand: 'Acme', links, locales: ['en'] });
mail.locales; // readonly 'en'[]
```

**Another fallback.** A service whose users are mostly French:

```ts
janusMail({ mailer, from, brand: 'Acme', links, fallbackLocale: 'fr' });
```

## Adding a locale

The defaults are built in `en` and `fr` only. A locale beyond them needs
**every template**: a default could not render it. `JanusMailOptions` makes
`templates` required and whole once `locales` holds one:

```ts
import { janusMail, type JanusMailTemplates } from '@nxgt/janus-mail';

type Locale = 'en' | 'fr' | 'de';

const templates: JanusMailTemplates<Locale> = {
	verifyEmail: ({ name, link, expiresIn, locale }) => render('verify-email', locale, { name, link, expiresIn }),
	resetPassword: ({ name, link, expiresIn, locale }) => render('reset-password', locale, { name, link, expiresIn }),
	signInCode: ({ code, expiresIn, locale }) => render('sign-in-code', locale, { code, expiresIn }),
	magicLink: ({ link, expiresIn, locale }) => render('magic-link', locale, { link, expiresIn }),
	stepUp: ({ name, code, expiresIn, link, locale }) => render('confirm-action', locale, { name, code, expiresIn, link }),
	passwordChanged: ({ name, link, locale }) => render('password-changed', locale, { name, link }),
	emailChanged: ({ name, link, newEmail, locale }) => render('email-changed', locale, { name, link, newEmail }),
	twoFactorEnabled: ({ name, link, locale }) => render('two-factor-enabled', locale, { name, link }),
	twoFactorDisabled: ({ name, link, locale }) => render('two-factor-disabled', locale, { name, link }),
	recoveryCodeUsed: ({ name, when, recoveryCodesLeft, link, locale }) =>
		render('recovery-code-used', locale, { name, when, recoveryCodesLeft, link }),
	newSignIn: ({ name, device, location, time, link, locale }) =>
		render('new-sign-in', locale, { name, device, location, time, link }),
	welcome: ({ name, link, locale }) => render('welcome', locale, { name, link }),
};

const mail = janusMail({ mailer, from, brand: 'Acme', links, locales: ['en', 'fr', 'de'], templates });
mail.locales; // readonly ('en' | 'fr' | 'de')[]
```

`render` here is yours; `expiresIn` is the expiry, already formatted in
`locale` — "1 Stunde" for `de`, where the runtime's `Intl` has German.
`recoveryCodesLeft` is the sentence the caller passed: the build holds the
plural of the codes left in `en` and `fr` only, so a German recipient's
`mail.recoveryCodeUsed` takes the sentence as text — "Sie haben noch 3
Wiederherstellungscodes." — and a count is a `TypeError` there.
`location`, left out of a `newSignIn`, is "Unknown location" for `de`:
the text of a missing location is held in `en` and `fr` only, so pass
`location` yourself — "Unbekannter Ort" — where it matters.
`recoveryCodeUsed` is the ninth template, since 0.5.0, `magicLink` the
tenth, since 0.7.0, `stepUp` the eleventh, since 0.8.0, and `newSignIn` the
twelfth, since 0.9.0: a `templates`
written for an earlier version no longer
compiles with a locale beyond `en` and `fr` — add the one it lacks. A
renderer over a Maizzle build of your own, with
`@nxgt/mail-presets` and a `locales/de.json`, is the closest to the defaults.
With only some templates, the call does not compile — the error lands on
`templates`:

```text
TS2740: Type '{ verifyEmail: () => Rendered; }' is missing the following properties from type 'JanusMailTemplates<"en" | "fr" | "de">': welcome, resetPassword, signInCode, magicLink, and 7 more.
```

and in JavaScript it throws when `janusMail()` is called:

```text
TypeError: janusMail: the default templates are built in en and fr only — with another locale in locales, pass every template in templates; resetPassword, signInCode, magicLink, stepUp, passwordChanged, emailChanged, twoFactorEnabled, twoFactorDisabled, recoveryCodeUsed, newSignIn, welcome missing
```

A default template is typed for `'en' | 'fr'`, so reusing one in a wider set
is refused too: `verifyEmail: janusTemplates().verifyEmail` in a
`JanusMailTemplates<'en' | 'fr' | 'de'>` is a compile error.

Built-in locales for more languages are on the [roadmap](../roadmap.md).

## See also

- `@nxgt/mail`'s [locales guide](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail/docs/guide/locales.md)
  — `pickLocale` and `parseAcceptLanguage` in full.
- [Templates](templates.md) — writing the twelve for a new locale.
