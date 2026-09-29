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
- [`janusMail: links must be an object, as { verifyEmail, resetPassword, secureAccount, getStarted }`](#janusmail-links-must-be-an-object-as--verifyemail-resetpassword-secureaccount-getstarted-)
- [`janusMail: links.<name> must be a function`](#janusmail-linksname-must-be-a-function)
- [`janusMail: links.recoveryCodes must be a function, or left out`](#janusmail-linksrecoverycodes-must-be-a-function-or-left-out)
- [`janusMail: links.magicLink must be a function, or left out`](#janusmail-linksmagiclink-must-be-a-function-or-left-out)
- [`janusMail: locales must list at least one locale, as ['en', 'fr']`](#janusmail-locales-must-list-at-least-one-locale-as-en-fr)
- [`janusMail: locales must be BCP 47 language tags, as 'fr-CA'`](#janusmail-locales-must-be-bcp-47-language-tags-as-fr-ca)
- [`janusMail: locales holds the same locale twice`](#janusmail-locales-holds-the-same-locale-twice)
- [`janusMail: fallbackLocale must be one of locales`](#janusmail-fallbacklocale-must-be-one-of-locales)
- [`janusMail: templates must be an object of functions, as { verifyEmail: (variables) => rendered }`](#janusmail-templates-must-be-an-object-of-functions-as--verifyemail-variables--rendered-)
- [`janusMail: templates has no template <name> — name one of verifyEmail, resetPassword, signInCode, magicLink, stepUp, passwordChanged, emailChanged, twoFactorEnabled, twoFactorDisabled, recoveryCodeUsed, newSignIn, welcome`](#janusmail-templates-has-no-template-name--name-one-of-verifyemail-resetpassword-signincode-magiclink-stepup-passwordchanged-emailchanged-twofactorenabled-twofactordisabled-recoverycodeused-newsignin-welcome)
- [`janusMail: templates.<name> must be a function`](#janusmail-templatesname-must-be-a-function)
- [`janusMail: templates.<name> is not an own enumerable property — pass a plain object, as { <name>: (variables) => rendered }`](#janusmail-templatesname-is-not-an-own-enumerable-property--pass-a-plain-object-as--name-variables--rendered-)
- [`janusMail: clock must be a Clock — an object with a now function`](#janusmail-clock-must-be-a-clock--an-object-with-a-now-function)
- [`janusMail: the default templates are built in en and fr only — with another locale in locales, pass every template in templates; <names> missing`](#janusmail-the-default-templates-are-built-in-en-and-fr-only--with-another-locale-in-locales-pass-every-template-in-templates-names-missing)

**Sending**
- [`janusMail.magicLink: links.magicLink is missing — pass it to janusMail({ links }) to send sign-in links`](#janusmailmagiclink-linksmagiclink-is-missing--pass-it-to-janusmail-links--to-send-sign-in-links)
- [`janusMail.stepUp: via must be 'email' — a step-up confirmed with the user's app sends no e-mail`](#janusmailstepup-via-must-be-email--a-step-up-confirmed-with-the-users-app-sends-no-e-mail)
- [`janusMail.<method>: <field> must be a string`](#janusmailmethod-field-must-be-a-string)
- [`janusMail.<method>: expiresAt must be a Date`](#janusmailmethod-expiresat-must-be-a-date)
- [`janusMail.recoveryCodeUsed: recoveryCodesLeft must be a count — a whole number, 0 or more — or the sentence to show`](#janusmailrecoverycodeused-recoverycodesleft-must-be-a-count--a-whole-number-0-or-more--or-the-sentence-to-show)
- [`janusMail.recoveryCodeUsed: recoveryCodesLeft must be the sentence to show in a locale the default e-mails are not built in`](#janusmailrecoverycodeused-recoverycodesleft-must-be-the-sentence-to-show-in-a-locale-the-default-e-mails-are-not-built-in)
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
- [The sign-in code turns unreadable in dark mode after upgrading `@nxgt/mail-ui` to 0.7](#the-sign-in-code-turns-unreadable-in-dark-mode-after-upgrading-nxgtmail-ui-to-07)
- [The link under the button is faint in light mode, or in dark mode](#the-link-under-the-button-is-faint-in-light-mode-or-in-dark-mode)

**Compile errors**
- [`TS2345: Argument of type '(IssuedToken & { user: … }) | null' is not assignable to parameter of type 'IssuedToken'.`](#ts2345-argument-of-type-issuedtoken---user----null-is-not-assignable-to-parameter-of-type-issuedtoken)
- [`TS2345: … Types of property 'expiresAt' are incompatible. Type 'string' is not assignable to type 'Date'.`](#ts2345--types-of-property-expiresat-are-incompatible-type-string-is-not-assignable-to-type-date)
- [`TS2739: Type '{ … }' is missing the following properties from type 'JanusMailTemplates<…>'`](#ts2739-type----is-missing-the-following-properties-from-type-janusmailtemplates)
- [`TS2741: Property 'recoveryCodeUsed' is missing in type '{ … }' but required in type 'JanusMailTemplates<…>'.`](#ts2741-property-recoverycodeused-is-missing-in-type----but-required-in-type-janusmailtemplates)
- [`TS2741: Property 'magicLink' is missing in type '{ … }' but required in type 'JanusMailTemplates<…>'.`](#ts2741-property-magiclink-is-missing-in-type----but-required-in-type-janusmailtemplates)
- [`TS2741: Property 'stepUp' is missing in type '{ … }' but required in type 'JanusMailTemplates<…>'.`](#ts2741-property-stepup-is-missing-in-type----but-required-in-type-janusmailtemplates)
- [`TS2741: Property 'newSignIn' is missing in type '{ … }' but required in type 'JanusMailTemplates<…>'.`](#ts2741-property-newsignin-is-missing-in-type----but-required-in-type-janusmailtemplates)
- [`TS2345: Argument of type 'StepUpByEmail<…> | StepUpByApp<…>' is not assignable to parameter of type 'Pick<StepUpByEmail<unknown>, …>'.`](#ts2345-argument-of-type-stepupbyemail--stepupbyapp-is-not-assignable-to-parameter-of-type-pickstepupbyemailunknown-)
- [`TS2322: Type '"de"' is not assignable to type '"en" | "fr"'.`](#ts2322-type-de-is-not-assignable-to-type-en--fr)
- [`TS2741: Property 'getStarted' is missing in type '{ … }' but required in type 'JanusMailLinks'.`](#ts2741-property-getstarted-is-missing-in-type----but-required-in-type-janusmaillinks)
- [`TS2322: Type 'number | null' is not assignable to type 'string | number'.`](#ts2322-type-number--null-is-not-assignable-to-type-string--number)
- [`TS2322: Type 'Date' is not assignable to type 'string'.`](#ts2322-type-date-is-not-assignable-to-type-string)
- [`TS2322: Type 'string | null' is not assignable to type 'string'.`, on `location`](#ts2322-type-string--null-is-not-assignable-to-type-string-on-location) — or `… to type 'string | undefined'.`

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

### `janusMail: links must be an object, as { verifyEmail, resetPassword, secureAccount, getStarted }`

No `links`. Four are required: the notices link to `secureAccount`, and
the welcome to `getStarted`. Two more, `recoveryCodes` and `magicLink`, are
optional.

### `janusMail: links.<name> must be a function`

`links.verifyEmail`, `links.resetPassword`, `links.secureAccount` or
`links.getStarted` missing, or given as a URL. The first two take the
one-time token; the other two take nothing:

```ts
links: {
	verifyEmail: (token) => `https://acme.example/verify?token=${encodeURIComponent(token)}`,
	resetPassword: (token) => `https://acme.example/reset?token=${encodeURIComponent(token)}`,
	secureAccount: () => 'https://acme.example/account/security',
	getStarted: () => 'https://acme.example/',
},
```

**`links.getStarted must be a function` right after an upgrade** is the
link the welcome e-mail added in 0.4.0: `links` written for 0.3 has no
`getStarted`. Add it — where a new user starts, your home page or your
sign-in page — even if you never send the welcome. In TypeScript the same
`links` is a compile error on `links`, `Property 'getStarted' is missing`.

### `janusMail: links.recoveryCodes must be a function, or left out`

`links.recoveryCodes` given as a URL, or as anything but a function. It is
optional — the recovery code notice links to `secureAccount` without it —
but when given it takes nothing and answers the page where the user
regenerates their codes:

```ts
links: { …, recoveryCodes: () => 'https://acme.example/account/recovery-codes' },
```

### `janusMail: links.magicLink must be a function, or left out`

`links.magicLink` given as a URL, or as anything but a function. It is
optional — an application that sends no sign-in link leaves it out — but
when given it takes the link's one-time token and answers **a page of
yours that spends nothing**, whose button posts the token to the route
calling `auth.magicLink.confirm`:

```ts
links: { …, magicLink: (token) => `https://acme.example/sign-in/link?token=${token}` },
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

### `janusMail: templates has no template <name> — name one of verifyEmail, resetPassword, signInCode, magicLink, stepUp, passwordChanged, emailChanged, twoFactorEnabled, twoFactorDisabled, recoveryCodeUsed, newSignIn, welcome`

A key that is not one of the twelve — `invitation`, or the e-mail's file name
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
out: the defaults could not render them in that locale. Pass all twelve — see
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

### `janusMail.magicLink: links.magicLink is missing — pass it to janusMail({ links }) to send sign-in links`

A `TypeError` from `mail.magicLink`, before anything is rendered or sent:
`janusMail()` was given no `links.magicLink`. It is optional, so
`janusMail()` accepts `links` without it — written before 0.7, or for an
application that sent no sign-in link — and there is no page to fall back
on: only yours can carry the token. Add it:

```ts
const mail = janusMail({
	…,
	links: { …, magicLink: (token) => `https://acme.example/sign-in/link?token=${token}` },
});
```

Sending again fails again: it is a bug, not an outage.

### `janusMail.stepUp: via must be 'email' — a step-up confirmed with the user's app sends no e-mail`

A `TypeError` from `mail.stepUp`, before anything is rendered or sent: it
was given what `auth.stepUp.request(user)` answered for a user whose second
factor is active — `via: 'secondFactor'`, with no code and no address — or
something with no `via` at all, such as a sign-in code's answer. A step-up
confirmed with the user's app sends nothing: ask for the code their app
shows. Check `via` first:

```ts
const issued = await auth.stepUp.request(current.user);
if (issued.via === 'email') {
	await mail.stepUp(issued, { name: current.user.name, locale: current.user.locale });
}
return Response.json({ challenge: issued.challenge, via: issued.via });
```

In TypeScript the unchecked call does not compile — see
[`TS2345: Argument of type 'StepUpByEmail<…> | StepUpByApp<…>' …`](#ts2345-argument-of-type-stepupbyemail--stepupbyapp-is-not-assignable-to-parameter-of-type-pickstepupbyemailunknown-).

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

`janusMail.magicLink: token must be a string` is a sign-in code's answer
given to `magicLink` — it has a `challenge`, never mailed, and no token:
send it with `signInCode`, or ask `auth.magicLink.request` for a link.

`issued` needs `token` and `email` (`code` and `email` for `signInCode`), and
the recipient its `name` — a user whose schema has no name passes one
anyway: `{ name: user.email }`. `janusMail.stepUp: name must be a string`
is `stepUp` called without the recipient: unlike `signInCode`, its e-mail
greets the user by name. `janusMail.verifyEmail: expiresIn must be a
string` is the third argument's `expiresIn` given as something else — a
number of seconds: pass the text to show, `{ expiresIn: '1 hour' }`, or
leave it out.

`janusMail.twoFactorEnabled: email must be a string` (or `twoFactorDisabled`,
`passwordChanged`, `recoveryCodeUsed` or `welcome`) is the user event itself
given to the e-mail: an event names the user by id alone. Read the user first:

```ts
const user = await auth.get(event.userId);
await mail.twoFactorDisabled({ name: user.name, locale: user.locale, email: user.email });
```

On `user.emailChanged`, `janusMail.emailChanged: name must be a string` is
the event itself given to `emailChanged`, and `janusMail.emailChanged:
formerEmail must be a string` is `event.formerEmail` passed without its
check — it is `null` for a user who had no e-mail before. `janusMail.emailChanged:
newEmail must be a string` is an update that removed the e-mail: there is no
new address to name. Check both, and read the rest from the user:

```ts
if (event.type === 'user.emailChanged' && event.formerEmail != null) {
	const user = await auth.get(event.userId);
	if (user.email === undefined) return; // removed: tell the former address your own way
	await mail.emailChanged({ name: user.name, locale: user.locale, formerEmail: event.formerEmail, newEmail: user.email });
}
```

`janusMail.newSignIn: device must be a string` and `janusMail.newSignIn:
time must be a string` are the second argument missing, or its `time` given
as the session's `Date`: pass the device as you describe it and the time as
text. `janusMail.newSignIn: location must be a string` is a location lookup's
`null`: leave `location` out, and the e-mail shows `—`. `janusMail.newSignIn:
email must be a string` is the `user.newDeviceSignedIn` event itself given
as the recipient — read the user first.

`janusMail.recoveryCodeUsed: when must be a string` is the second argument
missing, or its `when` given as the event's `Date`: pass the text to show,
formatted in the recipient's locale and time zone —
`new Intl.DateTimeFormat(user.locale, { dateStyle: 'long', timeStyle: 'short', timeZone }).format(event.occurredAt)`.

### `janusMail.<method>: expiresAt must be a Date`

A `TypeError` from `verifyEmail`, `resetPassword`, `signInCode`,
`magicLink` or `stepUp`: the e-mail says how long its link or code lasts, from `issued.expiresAt`, and that is
not a valid `Date`. The usual cause is a flow's answer that went through
JSON — a job queue, a cache — where a `Date` becomes a string. Nothing is
sent. Revive it when the job runs, or say the expiry yourself:

```ts
const issued = { ...job.issued, expiresAt: new Date(job.issued.expiresAt) };
await mail.verifyEmail(issued, { name: job.name });
// or
await mail.verifyEmail(job.issued, { name: job.name }, { expiresIn: '1 day' });
```

### `janusMail.recoveryCodeUsed: recoveryCodesLeft must be a count — a whole number, 0 or more — or the sentence to show`

A `TypeError`, before anything is rendered or sent. `recoveryCodesLeft` was
`null`, negative, a fraction, `NaN`, or missing. The usual cause is
`auth.secondFactor.recoveryCodesLeft(user)`'s answer passed unchecked: it is
`null` for a user with no active factor — turned off since the code was
spent — who has no codes to count. Check it, and send nothing then:

```ts
const recoveryCodesLeft = await auth.secondFactor.recoveryCodesLeft(user);
if (recoveryCodesLeft !== null) {
	await mail.recoveryCodeUsed(to, { when, recoveryCodesLeft });
}
```

### `janusMail.recoveryCodeUsed: recoveryCodesLeft must be the sentence to show in a locale the default e-mails are not built in`

A `TypeError`, before anything is sent: the recipient's locale is one of
yours beyond `en` and `fr`, and `recoveryCodesLeft` is a count. The plural
of the codes left is in the build's catalogue, in `en` and `fr` only, so the
count cannot be written for that locale. Pass the sentence as text:

```ts
await mail.recoveryCodeUsed(to, { when, recoveryCodesLeft: `Sie haben noch ${left} Wiederherstellungscodes.` });
```

### `janusMail.<method>: clock.now() must answer a Date`

A `TypeError` from `verifyEmail`, `resetPassword`, `signInCode`,
`magicLink` or `stepUp`: the `clock` given to `janusMail()` has a `now` that answered something else — a
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
answer a string`, `janusMail.welcome: links.getStarted() must answer a
string`, `janusMail.recoveryCodeUsed: links.recoveryCodes() must answer a
string`, `janusMail.magicLink: links.magicLink(token) must answer a string`. The `links` function answered something other than a
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
process, pass a mailer wrapped in `@nxgt/mail`'s `withRetry` (0.8 or later); once its
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
twelve templates yourself; an inlined build is on the [roadmap](roadmap.md).

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
the defaults turn theirs a mid slate there since 0.3.2, and dark since
0.4.1. The box is muted, which keeps its light value under dark mode unless
the build gives it a dark one.
Build the override with `@nxgt/mail-ui` 0.7.0 or later and set the muted
pair, as the defaults do since 0.4.1:

```ts
ui({
	brand: { name: 'Acme' },
	theme: {
		'color-muted-dark': '#1e293b', // the box, a step above the dark card
		'color-muted-foreground-dark': '#cbd5e1', // the code, 9.85:1 on it; muted text, 12.01:1 on the card
	},
});
```

### The sign-in code turns unreadable in dark mode after upgrading `@nxgt/mail-ui` to 0.7

A template of your own built as the defaults were before 0.4.1 — a mid-slate
`color-muted-dark: '#94a3b8'` and no `color-muted-foreground-dark` — shows
the code at 1.86:1 once rebuilt with `@nxgt/mail-ui` 0.7.0. Through 0.6.0,
`NxCode`'s text stayed the light foreground (`#020918`) in both modes; since
0.7.0 it turns `color-muted-foreground-dark` wherever its box turns
`color-muted-dark`, and that token falls back to the light muted text,
`#62748e`. The same token colours muted text on the dark card and page, so
no one value suits a mid-slate box: set a dark `color-muted-dark` and a
light `color-muted-foreground-dark`, as in the entry above.

### The link under the button is faint in light mode, or in dark mode

The link repeated in text under the button, for a client that shows no
button, is `@nxgt/mail-ui`'s `NxLink`, coloured with its info blue. Through
0.4, the defaults kept `@nxgt/mail-ui`'s `#54a2ff` in both modes: 2.63:1 on
the light card, 6.78:1 on the dark one. Since 0.5.0 they are built with
`@nxgt/mail-ui` 1.0, whose info blue has a dark twin, and set one blue per
mode: `#1d4ed8` on the light card, 6.70:1, and `#93c5fd` on the dark card,
9.89:1. Upgrade to read it.

A template of your own built with `@nxgt/mail-ui` 1.0.0 or later sets the
same pair in its `theme` — a light `color-info` dark enough for the white
card, and a `color-info-dark` light enough for the dark one; no single
value reaches 4.5:1 on both:

```ts
ui({
	brand: { name: 'Acme' },
	theme: {
		'color-info': '#1d4ed8', // the link on the light card, 6.70:1
		'color-info-dark': '#93c5fd', // the link on the dark card, 9.89:1
	},
});
```

Before 1.0, colour the link with the primary instead, which has a dark
twin: `NxLink` merges a `class` over its own `text-info`, and
`nx-dark-text-primary` follows `color-primary-dark` in dark mode:

```vue
<NxLink :href="link" class="text-primary nx-dark-text-primary">{{ link }}</NxLink>
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

`auth.magicLink.request(email)`'s answer, passed to `mail.magicLink`
unchecked, reads the same. The same holds for `signInCode.request`, whose
answer passed unchecked reads
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
all twelve. With five or more missing, the code is `TS2740` and the list ends
`…, and <n> more.` — `…, and 7 more.` for a `templates` holding one
template. See [Adding a locale](guide/locales.md#adding-a-locale).

### `TS2741: Property 'recoveryCodeUsed' is missing in type '{ … }' but required in type 'JanusMailTemplates<…>'.`

`templates` written for 0.4, with a locale beyond `en` and `fr`: since
0.5.0 `recoveryCodeUsed` is one of the templates, and with such a locale every one is yours.
Add `recoveryCodeUsed` — it is given `brand`, `name`, `when`,
`recoveryCodesLeft` (a sentence) and `link` — even if you never send it; in
JavaScript the same `templates` is
[`janusMail: the default templates are built in en and fr only — …; recoveryCodeUsed missing`](#janusmail-the-default-templates-are-built-in-en-and-fr-only--with-another-locale-in-locales-pass-every-template-in-templates-names-missing).
See [Templates](guide/templates.md#what-each-template-is-given).

### `TS2741: Property 'magicLink' is missing in type '{ … }' but required in type 'JanusMailTemplates<…>'.`

`templates` written before 0.7, with a locale beyond `en` and `fr`: since
0.7.0 there are ten templates, and with such a locale every one is yours.
Add `magicLink` — it is given `brand`, `link` and `expiresIn` — even if you
never send it; in JavaScript the same `templates` is
[`janusMail: the default templates are built in en and fr only — …; magicLink missing`](#janusmail-the-default-templates-are-built-in-en-and-fr-only--with-another-locale-in-locales-pass-every-template-in-templates-names-missing).

### `TS2741: Property 'stepUp' is missing in type '{ … }' but required in type 'JanusMailTemplates<…>'.`

`templates` written before 0.8, with a locale beyond `en` and `fr`: since
0.8.0 there are eleven templates, and with such a locale every one is
yours. Add `stepUp` — it is given `brand`, `name`, `code`, `expiresIn` and
`link` — even if you never send it; in JavaScript the same `templates` is
[`janusMail: the default templates are built in en and fr only — …; stepUp missing`](#janusmail-the-default-templates-are-built-in-en-and-fr-only--with-another-locale-in-locales-pass-every-template-in-templates-names-missing).
See [Templates](guide/templates.md#what-each-template-is-given).

### `TS2741: Property 'newSignIn' is missing in type '{ … }' but required in type 'JanusMailTemplates<…>'.`

`templates` written before 0.9, with a locale beyond `en` and `fr`: since
0.9.0 there are twelve templates, and with such a locale every one is
yours. Add `newSignIn` — it is given `brand`, `name`, `device`, `location`,
`time` and `link` — even if you never send it; in JavaScript the same
`templates` is
[`janusMail: the default templates are built in en and fr only — …; newSignIn missing`](#janusmail-the-default-templates-are-built-in-en-and-fr-only--with-another-locale-in-locales-pass-every-template-in-templates-names-missing).
See [Templates](guide/templates.md#what-each-template-is-given).

### `TS2345: Argument of type 'StepUpByEmail<…> | StepUpByApp<…>' is not assignable to parameter of type 'Pick<StepUpByEmail<unknown>, …>'.`

What `auth.stepUp.request(user)` answered, passed to `mail.stepUp` without
checking `via`, on a user type that may have a second factor. The error
goes on: `Type 'StepUpByApp<…>' is missing the following properties …`,
naming `code` and `email` — a user whose factor is active confirms with their app, and
there is nothing to send. Narrow it first:

```ts
const issued = await auth.stepUp.request(current.user);
if (issued.via === 'email') await mail.stepUp(issued, { name: current.user.name });
```

A sign-in code's answer given to `stepUp` reads `Property 'via' is missing
in type 'IssuedCode<…>'`: a sign-in code signs in, it confirms no action —
send it with `signInCode`.

### `TS2322: Type '"de"' is not assignable to type '"en" | "fr"'.`

A `fallbackLocale` outside `locales`. Add it to `locales` — with every
template, if it is not `en` or `fr` — or pick one of them.

### `TS2741: Property 'getStarted' is missing in type '{ … }' but required in type 'JanusMailLinks'.`

`links` written for 0.3, before the welcome e-mail: since 0.4.0 it takes
`getStarted` too, where the welcome's **Get started** button leads. Add it,
even if you never send the welcome — in JavaScript the same `links` is
[`janusMail: links.<name> must be a function`](#janusmail-linksname-must-be-a-function):

```ts
links: {
	verifyEmail: (token) => `https://acme.example/verify?token=${encodeURIComponent(token)}`,
	resetPassword: (token) => `https://acme.example/reset?token=${encodeURIComponent(token)}`,
	secureAccount: () => 'https://acme.example/account/security',
	getStarted: () => 'https://acme.example/',
},
```

### `TS2322: Type 'number | null' is not assignable to type 'string | number'.`

On `recoveryCodesLeft`: `auth.secondFactor.recoveryCodesLeft(user)`'s
answer, passed without checking it for `null`. A user with no active factor
has no codes to count; check it first, as in
[`recoveryCodesLeft must be a count`](#janusmailrecoverycodeused-recoverycodesleft-must-be-a-count--a-whole-number-0-or-more--or-the-sentence-to-show).

### `TS2322: Type 'Date' is not assignable to type 'string'.`

On `when`: the event's `occurredAt` passed as it is — or, on `newSignIn`'s
`time`, the session's `createdAt`. Both are the text the e-mail shows —
format the date in the recipient's locale and time zone first:

```ts
const when = new Intl.DateTimeFormat(user.locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })
	.format(event.occurredAt);
```

### `TS2322: Type 'string | null' is not assignable to type 'string'.`, on `location`

Also, without `exactOptionalPropertyTypes` in your tsconfig:
`Type 'string | null' is not assignable to type 'string | undefined'.`

On `newSignIn`'s `location`: a geo-IP lookup's answer, `null` when it found
nothing, passed as it is. `location` is optional: leave it out, and the
e-mail shows `—`:

```ts
await mail.newSignIn(to, { device, time, ...(city === null ? {} : { location: city }) });
```
