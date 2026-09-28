# Troubleshooting `@nxgt/janus-mail`

Each entry is headed by the text you see: a message, an error `code`, a
compiler error — or, where nothing is thrown, what the e-mail says. Search this page for the words of your message.

How the messages are shaped:

- **Every message starts with the call you wrote**: `janusMail: …` for an
  option, `janusMail.<method>: …` for a call. Messages from `@nxgt/mail` start
  with its own calls: `render: …`, `send: …`, `createMailRenderer: …`.
- **A `TypeError` is a wiring mistake**, from how the application was put
  together — never from what a recipient did. Fix the code; no handler
  should answer one.
- **A message names the option or the field, never its value**: a link in a
  verification e-mail is a credential, and never reaches a log through an
  error.
- **`MailFailure` and `MailRefused` are `@nxgt/mail`'s**, passed through
  untouched: this package defines no error class.

## Index

**Wiring — `janusMail()`**
- [`janusMail: options must be an object, as { mailer, from, brand, links }`](#janusmail-options-must-be-an-object-as--mailer-from-brand-links-)
- [`janusMail: mailer must be a Mailer — an object with a send function`](#janusmail-mailer-must-be-a-mailer--an-object-with-a-send-function)
- [`janusMail: from must be an address, as 'noreply@example.com' or { name, address }`](#janusmail-from-must-be-an-address-as-noreplyexamplecom-or--name-address-)
- [`janusMail: replyTo must be an address, as 'support@example.com' or { name, address }`](#janusmail-replyto-must-be-an-address-as-supportexamplecom-or--name-address-)
- [`janusMail: brand must be the name the e-mails show, as 'Acme'`](#janusmail-brand-must-be-the-name-the-e-mails-show-as-acme)
- [`janusMail: links must be an object, as { verifyEmail, resetPassword, secureAccount }`](#janusmail-links-must-be-an-object-as--verifyemail-resetpassword-secureaccount-)
- [`janusMail: links.<name> must be a function`](#janusmail-linksname-must-be-a-function)
- [`janusMail: locales must list at least one locale, as ['en', 'fr']`](#janusmail-locales-must-list-at-least-one-locale-as-en-fr)
- [`janusMail: locales must be BCP 47 language tags, as 'fr-CA'`](#janusmail-locales-must-be-bcp-47-language-tags-as-fr-ca)
- [`janusMail: locales holds the same locale twice`](#janusmail-locales-holds-the-same-locale-twice)
- [`janusMail: fallbackLocale must be one of locales`](#janusmail-fallbacklocale-must-be-one-of-locales)
- [`janusMail: templates must be an object of functions, as { verifyEmail: (variables) => rendered }`](#janusmail-templates-must-be-an-object-of-functions-as--verifyemail-variables--rendered-)
- [`janusMail: templates has no template <name> — name one of verifyEmail, resetPassword, signInCode, passwordChanged, emailChanged, twoFactorEnabled, twoFactorDisabled`](#janusmail-templates-has-no-template-name--name-one-of-verifyemail-resetpassword-signincode-passwordchanged-emailchanged-twofactorenabled-twofactordisabled)
- [`janusMail: templates.<name> must be a function`](#janusmail-templatesname-must-be-a-function)
- [`janusMail: templates.<name> is not an own enumerable property — pass a plain object, as { <name>: (variables) => rendered }`](#janusmail-templatesname-is-not-an-own-enumerable-property--pass-a-plain-object-as--name-variables--rendered-)
- [`janusMail: clock must be a Clock — an object with a now function`](#janusmail-clock-must-be-a-clock--an-object-with-a-now-function)
- [`janusMail: the default templates are built in en and fr only — with another locale in locales, pass every template in templates; <names> missing`](#janusmail-the-default-templates-are-built-in-en-and-fr-only--with-another-locale-in-locales-pass-every-template-in-templates-names-missing)

**Sending**
- [`janusMail.<method>: <field> must be a string`](#janusmailmethod-field-must-be-a-string)
- [`janusMail.<method>: expiresAt must be a Date`](#janusmailmethod-expiresat-must-be-a-date)
- [`janusMail.<method>: clock.now() must answer a Date`](#janusmailmethod-clocknow-must-answer-a-date)
- [`janusMail.<method>: expiresAt is past — the link or code would not work`](#janusmailmethod-expiresat-is-past--the-link-or-code-would-not-work)
- [`This link expires in 1 hour.` — in the wrong language, or shorter than the `tokens` TTL](#this-link-expires-in-1-hour--in-the-wrong-language-or-shorter-than-the-tokens-ttl)
- [`MAIL_REFUSED` — `render: <email>: link must be an http:, https: or mailto: URL`](#mail_refused--render-email-link-must-be-an-http-https-or-mailto-url)
- [`janusMail.<method>: links.<call> must answer a string`](#janusmailmethod-linkscall-must-answer-a-string)
- [`render: <email>: link must be a string or a finite number`](#render-email-link-must-be-a-string-or-a-finite-number)
- [`MAIL_REFUSED` — from the mailer](#mail_refused--from-the-mailer)
- [`MAIL_FAILED` — `MailFailure`](#mail_failed--mailfailure)
- [`createMailRenderer: …/mails/mail-manifest.json cannot be read — run maizzle build, and deploy its output folder`](#createmailrenderer-mailsmail-manifestjson-cannot-be-read--run-maizzle-build-and-deploy-its-output-folder)
- [`Could not resolve "node:fs"` on an edge runtime](#could-not-resolve-nodefs-on-an-edge-runtime)
- [An e-mail stays light in dark mode](#an-e-mail-stays-light-in-dark-mode)
- [The button all but vanishes in dark mode](#the-button-all-but-vanishes-in-dark-mode)
- [The sign-in code's box stays a light slab in dark mode](#the-sign-in-codes-box-stays-a-light-slab-in-dark-mode)

**Compile errors**
- [`TS2345: Argument of type '(IssuedToken & { user: … }) | null' is not assignable to parameter of type 'IssuedToken'.`](#ts2345-argument-of-type-issuedtoken---user----null-is-not-assignable-to-parameter-of-type-issuedtoken)
- [`TS2345: … Types of property 'expiresAt' are incompatible. Type 'string' is not assignable to type 'Date'.`](#ts2345--types-of-property-expiresat-are-incompatible-type-string-is-not-assignable-to-type-date)
- [`TS2739: Type '{ … }' is missing the following properties from type 'JanusMailTemplates<…>'`](#ts2739-type----is-missing-the-following-properties-from-type-janusmailtemplates)
- [`TS2322: Type '"de"' is not assignable to type '"en" | "fr"'.`](#ts2322-type-de-is-not-assignable-to-type-en--fr)

---

## Wiring — `janusMail()`

Each is a bare `TypeError`, thrown when `janusMail()` is called — at
start-up, before anything is sent.

### `janusMail: options must be an object, as { mailer, from, brand, links }`

`janusMail()` called with nothing, `null`, or not an object. Pass the options.

### `janusMail: mailer must be a Mailer — an object with a send function`

No `mailer`, or one without `send`. Pass a transport's mailer — or
`createMemoryMailer()` in a test:

```ts
import { createResendMailer } from '@nxgt/mail-resend';
janusMail({ mailer: createResendMailer({ apiKey }), from, brand: 'Acme', links });
```

### `janusMail: from must be an address, as 'noreply@example.com' or { name, address }`

No `from`, a blank string, or an object without its `address`. A name and an
address are written `{ name: 'Acme', address: 'noreply@acme.example' }`,
never `'Acme <noreply@acme.example>'` — the mailer refuses that string with
`MailRefused` at the first send.

### `janusMail: replyTo must be an address, as 'support@example.com' or { name, address }`

A `replyTo` given, and not an address. Leave it out to reply to `from`.

### `janusMail: brand must be the name the e-mails show, as 'Acme'`

No `brand`, a blank one, or not a string — `{ name: 'Acme' }`, the shape of
`@nxgt/mail-ui`, included. The brand is the name alone:

```ts
janusMail({ mailer, from, brand: 'Acme', links });
```

### `janusMail: links must be an object, as { verifyEmail, resetPassword, secureAccount }`

No `links`. All three are required: the notices link to `secureAccount`.

### `janusMail: links.<name> must be a function`

`links.verifyEmail`, `links.resetPassword` or `links.secureAccount` missing,
or given as a URL. The first two take the one-time token; the third takes
nothing:

```ts
links: {
	verifyEmail: (token) => `https://acme.example/verify?token=${encodeURIComponent(token)}`,
	resetPassword: (token) => `https://acme.example/reset?token=${encodeURIComponent(token)}`,
	secureAccount: () => 'https://acme.example/account/security',
},
```

### `janusMail: locales must list at least one locale, as ['en', 'fr']`

`locales: []`, `locales: 'en'`, or a list holding something that is not a
non-empty string. Leave it out for `['en', 'fr']`.

### `janusMail: locales must be BCP 47 language tags, as 'fr-CA'`

A `TypeError` when `janusMail()` is called: a locale in `locales` is one
`Intl` refuses — `de_DE` with an underscore, a grandfathered `i-klingon`, a
bare private-use `x-…`. The expiry is formatted by `Intl` in the locale
picked, so a locale it cannot parse would fail at the first send; it is
refused here instead. Write a tag `Intl` takes — `de-DE`, not `de_DE`; `tlh`,
not `i-klingon`:

```ts
janusMail({ mailer, from, brand: 'Acme', links, locales: ['en', 'fr', 'de-DE'], templates });
```

### `janusMail: locales holds the same locale twice`

`['en', 'en']`. List each once.

### `janusMail: fallbackLocale must be one of locales`

A `fallbackLocale` the list does not hold — `'de'` with the default
`locales`. It is also a compile error; see
[`TS2322: Type '"de"'…`](#ts2322-type-de-is-not-assignable-to-type-en--fr).

### `janusMail: templates must be an object of functions, as { verifyEmail: (variables) => rendered }`

`templates` given as a list or a function. Key each template by its name.

### `janusMail: templates has no template <name> — name one of verifyEmail, resetPassword, signInCode, passwordChanged, emailChanged, twoFactorEnabled, twoFactorDisabled`

A key that is not one of the seven — `welcome`, or the e-mail's file name
`'verify-email'` rather than the template's, `verifyEmail`. Other e-mails are
on the [roadmap](roadmap.md); send them with `@nxgt/mail` directly meanwhile.

### `janusMail: templates.<name> must be a function`

A template given as a string, a `Rendered`, or `undefined`. A template is a
function of its variables: `signInCode: ({ code }) => ({ subject, html, text })`.

### `janusMail: templates.<name> is not an own enumerable property — pass a plain object, as { <name>: (variables) => rendered }`

`templates` holds the template, but not as an own enumerable property. Two
causes:

- **a method on a prototype** — `templates` is a class instance whose
  templates are methods;
- **an own property that is not enumerable** — one set with
  `Object.defineProperty` and no `enumerable: true`.

Only an object's own enumerable keys are copied over the defaults, so the
template would be dropped and the default sent in its place: refused
instead. Pass a plain object, binding the methods if they read `this`:

```ts
const own = new MyTemplates();
janusMail({ …, templates: { signInCode: own.signInCode.bind(own) } });
```

A class whose templates are fields (`signInCode = (variables) => …`) passes
as it is: fields are own properties.

### `janusMail: the default templates are built in en and fr only — with another locale in locales, pass every template in templates; <names> missing`

`locales` holds a locale beyond `en` and `fr`, and `templates` leaves some
out: the defaults could not render them in that locale. Pass all seven — see
[Adding a locale](guide/locales.md#adding-a-locale) — or drop the locale.
The message lists the templates missing.

### `janusMail: clock must be a Clock — an object with a now function`

`clock` is `@nxgt/janus`'s `Clock`, `{ now(): Date }` — pass the one given to
`janus({ clock })`, not `Date.now` or `() => new Date()`:

```ts
import { fixedClock } from '@nxgt/janus';

const clock = fixedClock(Date.UTC(2026, 0, 1));
janusMail({ mailer, from, brand: 'Acme', links, clock });
```

## Sending

### `janusMail.<method>: <field> must be a string`

A `TypeError` from a call, naming the method and the field it could not read
— `janusMail.resetPassword: token must be a string`,
`janusMail.verifyEmail: name must be a string`,
`janusMail.emailChanged: formerEmail must be a string`. The usual cause is
passing what a flow answered without checking it for `null`:

```ts
const issued = await auth.resetPassword.request(email);
if (issued !== null) await mail.resetPassword(issued, { name: issued.user.name });
```

`issued` needs `token` and `email` (`code` and `email` for `signInCode`), and
the recipient its `name` — a user whose schema has no name passes one
anyway: `{ name: user.email }`. `janusMail.verifyEmail: expiresIn must be a
string` is the third argument's `expiresIn` given as something else — a
number of seconds: pass the text to show, `{ expiresIn: '1 hour' }`, or
leave it out.

`janusMail.twoFactorEnabled: email must be a string` (or `twoFactorDisabled`)
is the user event itself given to the notice: an event names the user by id
alone. Read the user first:

```ts
const user = await auth.get(event.userId);
await mail.twoFactorDisabled({ name: user.name, locale: user.locale, email: user.email });
```

### `janusMail.<method>: expiresAt must be a Date`

A `TypeError` from `verifyEmail`, `resetPassword` or `signInCode`: the e-mail
says how long its link or code lasts, from `issued.expiresAt`, and that is
not a valid `Date`. The usual cause is a flow's answer that went through
JSON — a job queue, a cache — where a `Date` becomes a string. Nothing is
sent. Revive it when the job runs, or say the expiry yourself:

```ts
const issued = { ...job.issued, expiresAt: new Date(job.issued.expiresAt) };
await mail.verifyEmail(issued, { name: job.name });
// or
await mail.verifyEmail(job.issued, { name: job.name }, { expiresIn: '1 day' });
```

### `janusMail.<method>: clock.now() must answer a Date`

A `TypeError` from `verifyEmail`, `resetPassword` or `signInCode`: the
`clock` given to `janusMail()` has a `now` that answered something else — a
number from `Date.now()`, a string, an invalid `Date`. Nothing is sent.
`clock` is `@nxgt/janus`'s `Clock`: pass the one `janus({ clock })` was
given, or `{ now: () => new Date() }`.

### `janusMail.<method>: expiresAt is past — the link or code would not work`

A `TypeError`: the send came after the link or the code expired — a queue
that waited too long, an `expiresAt` from another record, or, in tests,
`janus({ clock: fixedClock(...) })` without the same `clock` given to
`janusMail()`, so a date in the clock's past is measured against today. Nothing is
sent: an e-mail whose link fails helps nobody. Issue a new one
(`auth.verifyEmail.send(user)`, `auth.signInCode.request(email)`) and send
that; if a queue can hold a send that long, lengthen the `tokens` TTL in
`janus({ tokens })`.

### `This link expires in 1 hour.` — in the wrong language, or shorter than the `tokens` TTL

`expiresIn` is formatted by the runtime's `Intl.NumberFormat`, in the locale
picked for the recipient. A locale the runtime has no data for — a Node
built with `small-icu`, a locale of your own — is formatted in the
runtime's default language. The time left is measured against
`janusMail({ clock })`, rounded to the minute, then **down** to the largest
whole unit: 90 minutes is "1 hour", 36 hours "1 day".
For another wording, pass it:

```ts
await mail.resetPassword(issued, { name, locale: 'de' }, { expiresIn: '90 Minuten' });
```

French puts a no-break space between the number and some units (`1 heure`,
per CLDR): compare with `\s` in a test, not a plain space.

### `MAIL_REFUSED` — `render: <email>: link must be an http:, https: or mailto: URL`

A `MailRefused` from `@nxgt/mail`'s renderer, before the mailer is called
(`mailer.attempts` stays 0). A link from `links` is not an absolute URL a
mail client can follow: `/verify?token=…` (relative), `javascript:…`,
`data:…`, or a URL holding a quote, a space or a line break. Make every
`links` function answer an absolute `https://` URL:

```ts
links: { verifyEmail: (token) => new URL(`/verify?token=${encodeURIComponent(token)}`, 'https://acme.example').href, … }
```

Sending it again fails again: it is a bug, not an outage.

A `mailto:` URL is accepted — `secureAccount: () => 'mailto:security@acme.example'`
sends a user who did not make the change to your support desk.

### `janusMail.<method>: links.<call> must answer a string`

A `TypeError` from a call, before anything is rendered or sent
(`mailer.attempts` stays 0) — `janusMail.verifyEmail: links.verifyEmail(token)
must answer a string`, `janusMail.emailChanged: links.secureAccount() must
answer a string`. The `links` function answered something other than a
string: a `URL` object, `undefined`, or a promise — an `async` function.
Answer `url.href`, and compute the link synchronously:

```ts
const base = new URL('https://acme.example');
links: {
	verifyEmail: (token) => new URL(`/verify?token=${encodeURIComponent(token)}`, base).href,
	…
}
```

A link that needs a lookup — a tenant's domain — is looked up before the
call, and the `links` function reads what was looked up.

In TypeScript, an `async` link or a `URL` object is a compile error, so this
is only reached from JavaScript, or through a cast.

### `render: <email>: link must be a string or a finite number`

A `TypeError` from the renderer, when `janusTemplates()` or
`mail.templates.*` is called directly with a `link` that is not a string;
`janusMail()`'s methods check the link first, and throw the entry above
instead. The renderer's other messages —
`render: the locale asked for is not one of the build's, en, fr` and
`render: <email> needs the variable <name>` — come from calling
`janusTemplates()` or `mail.templates.*` directly with a locale not built or
a variable left out; `janusMail()`'s methods never do either. See `@nxgt/mail`'s
[troubleshooting](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail/docs/troubleshooting.md).

### `MAIL_REFUSED` — from the mailer

The message was refused by `checkMessage` or the provider: an `issued.email`
or a `to.email` that is not an address, a `from` written
`'Acme <noreply@acme.example>'`. The message names the field (`send: to is
not an e-mail address`) — see `@nxgt/mail`'s
[troubleshooting](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail/docs/troubleshooting.md).

### `MAIL_FAILED` — `MailFailure`

The transport could not hand the e-mail over: a refused connection, a
timeout, a 5xx. **Nothing is known to have been sent.** The method rejects
with the mailer's own error — `error === theMailersError` — so its `cause`
is the transport's. Answer it as an outage, and never as "sent":

```ts
import { MailError } from '@nxgt/mail';

try {
	await mail.signInCode(issued);
} catch (error) {
	if (error instanceof MailError && error.code === 'MAIL_FAILED') {
		return Response.json({ code: 'MAIL_FAILED' }, { status: 503 }); // or queue a retry
	}
	throw error;
}
```

This package retries nothing: a retry is your decision. To retry in
process, pass a mailer wrapped in `@nxgt/mail` 0.8's `withRetry`; once its
attempts run out it rejects with the last `MailFailure`, `attempts` on it —
see [Retrying and tracing the mailer](guide/sending.md#retrying-and-tracing-the-mailer).

### `createMailRenderer: …/mails/mail-manifest.json cannot be read — run maizzle build, and deploy its output folder`

A plain `Error`, the first time a default template renders: the package's
`mails/` folder is missing. The installed package was copied without it — a
bundler that inlined `@nxgt/janus-mail` into one file, or a deploy that kept
`dist/` only. Keep `@nxgt/janus-mail` external to your bundle, and deploy
`node_modules/@nxgt/janus-mail/mails/` with it. Overriding every template
avoids the read altogether. (In this repository: run `bun run build`.)

### `Could not resolve "node:fs"` on an edge runtime

The default templates read `mails/` with `node:fs`, through
`@nxgt/mail/renderer`: Node, Bun or Deno only. On an edge runtime, pass all
seven templates yourself; an inlined build is on the [roadmap](roadmap.md).

### An e-mail stays light in dark mode

Two causes, neither an error:

- **Gmail.** Its web and mobile clients cannot be targeted from CSS and
  always show the light e-mail. Every other client that reads
  `prefers-color-scheme`, or Outlook's `[data-ogsc]`, shows the dark one.
- **A template of your own.** The dark rules are in the default HTML, built
  by `@nxgt/mail-ui`. An override that returns its own `html` has none of
  them; build it with `@nxgt/mail-ui` 0.4.0 or later to follow dark mode:

```ts
janusMail({ mailer, from, brand, links, templates: { verifyEmail: myVerifyEmail } });
// myVerifyEmail's html needs its own color-scheme and dark rules
```

### The button all but vanishes in dark mode

A template of your own, built with a near-black primary, shows a button
that melts into the dark card for a reader in dark mode; the defaults turn
theirs near-white there since 0.3.1. `@nxgt/mail-ui`'s primary keeps its
light value under dark mode unless the build gives it a dark one — `#27272a`
on the dark card is 1.2:1. Build the override with `@nxgt/mail-ui` 0.5.0 or
later and set the dark pair in its `theme`, as the defaults do:

```ts
ui({
	brand: { name: 'Acme' },
	theme: {
		'color-primary': '#27272a',
		'color-primary-dark': '#fafafa', // 17:1 on the dark card
		'color-primary-foreground-dark': '#18181b', // the button's text, in dark mode
	},
});
```

### The sign-in code's box stays a light slab in dark mode

A `signInCode` template of your own, built with `@nxgt/mail-ui`'s `NxCode`,
keeps its light box (`#f1f5f9`) on the dark card for a reader in dark mode;
the defaults turn theirs a mid slate there since 0.3.2. The box is muted,
which keeps its light value under dark mode unless the build gives it a dark
one. Build the override with `@nxgt/mail-ui` 0.6.0 or later and set
`color-muted-dark`. The code's text stays the light foreground (`#020918`) in
both modes, so a dark muted such as `#1e293b` leaves it at 1.36:1: pick one
light enough for that text, as the defaults do:

```ts
ui({
	brand: { name: 'Acme' },
	theme: {
		'color-muted-dark': '#94a3b8', // the code at 7.76:1 on it, 6.95:1 against the dark card
	},
});
```

## Compile errors

### `TS2345: Argument of type '(IssuedToken & { user: … }) | null' is not assignable to parameter of type 'IssuedToken'.`

`auth.resetPassword.request(email)` answers `null` for an address nobody
holds. Check it before sending, and answer the visitor the same either way:

```ts
const issued = await auth.resetPassword.request(email);
if (issued !== null) await mail.resetPassword(issued, { name: issued.user.name });
return new Response(null, { status: 202 });
```

The same holds for `signInCode.request`, whose answer passed unchecked reads
`Argument of type 'IssuedCode<…> | null' is not assignable to parameter of
type 'Pick<IssuedCode<unknown>, "email" | "code" | "expiresAt">'`.

### `TS2345: … Types of property 'expiresAt' are incompatible. Type 'string' is not assignable to type 'Date'.`

A flow's answer that went through JSON, typed as it came out. Revive the
date — `{ ...issued, expiresAt: new Date(issued.expiresAt) }` — or pass the
expiry as text in the third argument. A sign-in code built by hand without
`expiresAt` reads `Property 'expiresAt' is missing`: pass the flow's answer
whole.

### `TS2739: Type '{ … }' is missing the following properties from type 'JanusMailTemplates<…>'`

`locales` holds a locale beyond `en` and `fr`, and `templates` does not give
all seven. See [Adding a locale](guide/locales.md#adding-a-locale).

### `TS2322: Type '"de"' is not assignable to type '"en" | "fr"'.`

A `fallbackLocale` outside `locales`. Add it to `locales` — with every
template, if it is not `en` or `fr` — or pick one of them.
