# @nxgt/janus-mail

The e-mails of [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus)'s
flows, ready to send: **e-mail verification, password reset, sign-in code,
password changed, e-mail changed, two-factor authentication turned on or
off, a recovery code used, and a welcome to a new user**, in English and
French, with your brand
in them. `@nxgt/janus` sends no e-mail — its flows answer what to send — and
this package turns that answer into an e-mail and hands it to any
[`@nxgt/mail`](https://www.npmjs.com/package/@nxgt/mail) transport.

```ts
import { createMemoryMailer } from '@nxgt/mail';
import { janusMail } from '@nxgt/janus-mail';

const mail = janusMail({
	mailer: createMemoryMailer(), // in production, a transport: @nxgt/mail-smtp, @nxgt/mail-resend…
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		verifyEmail: (token) => `https://acme.example/verify?token=${token}`,
		resetPassword: (token) => `https://acme.example/reset?token=${token}`,
		secureAccount: () => 'https://acme.example/account/security',
		getStarted: () => 'https://acme.example/',
		recoveryCodes: () => 'https://acme.example/account/recovery-codes', // optional
	},
});

await mail.verifyEmail(await auth.verifyEmail.send(user), { name: user.name, locale: user.locale });
```

The e-mails are built with [Maizzle](https://maizzle.com) when **this
package** is built — from
[`@nxgt/mail-presets`](https://www.npmjs.com/package/@nxgt/mail-presets),
CSS inlined for mail clients — and shipped as HTML and text. At send time
they are only filled in: your brand, the recipient's name, your links, how
long the link or code lasts, every value escaped. No template engine and no Maizzle run in your server.

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-mail @nxgt/mail @nxgt/janus
bun add -d typescript
```

Three peers, all required: `@nxgt/mail` (0.1 or later, below 2 — 1.0 and
its transports included), which defines the `Mailer` port and the errors;
`@nxgt/janus` (0.14), whose flows' answers the methods take — types only,
nothing of it is loaded; and `typescript` (6). **No Maizzle, no Vue, no
Tailwind**: they run at this package's build, not in yours.

The `@nxgt/mail` floor is tested, not claimed: the package's specs and its
typecheck run on `@nxgt/mail` 0.1.0 as well, in the Floors job, on every CI
run.

It reads its prebuilt e-mails with `node:fs`: **Node (20 or later), Bun or
Deno**, not an edge runtime. Rebuilding the e-mails from this repository
needs Node `^22.22.3`, `^24.15.0` or `>=26`, for Maizzle — see
[Building](docs/guide/building.md); installing the package needs no build. Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`.

## API

| Export | What it is |
| --- | --- |
| `janusMail(options)` | The e-mails, over your mailer: `verifyEmail`, `resetPassword`, `signInCode`, `passwordChanged`, `emailChanged`, `twoFactorEnabled`, `twoFactorDisabled`, `recoveryCodeUsed`, `welcome`, and `templates` and `locales`. Options: `mailer`, `from`, `replyTo?`, `brand`, `links` (`verifyEmail`, `resetPassword`, `secureAccount`, `getStarted`, and `recoveryCodes?`), `locales?`, `fallbackLocale?`, `templates?`, `clock?`. A wrong option is a bare `TypeError`, thrown here |
| `janusTemplates()` | The nine default templates alone, each `(variables & { locale }) => Rendered` |
| `JanusMail<L>`, `JanusMailOptions<L>` | What `janusMail()` answers and takes, for the locales `L` |
| `JanusMailTemplate<V, L>`, `JanusMailTemplates<L>`, `JanusMailTemplateName` | One template, the nine of them, and their names |
| `JanusMailVariables` | What each template is given: `brand`, and `name`, `link`, `code`, `expiresIn`, `newEmail`, `when` or `recoveryCodesLeft` as its e-mail needs |
| `JanusMailSendOptions` | The third argument of `verifyEmail`, `resetPassword` and `signInCode`: `{ expiresIn? }`, the expiry as text, over the one derived |
| `JanusMailLocale` | `'en' \| 'fr'`: the locales the defaults are built in |
| `JanusMailLinks`, `Recipient` | The `links` option; who an e-mail is for — `{ name, locale? }` |

Each method answers the mailer's `SentMail` and **rejects with the mailer's
`MailFailure` or `MailRefused`, untouched**: this package defines no error
class. To retry a `MailFailure` or trace each send, wrap the mailer you pass:
`withMailTelemetry(withRetry(mailer), { transport })` — `withRetry` from
`@nxgt/mail` 0.8 or later, `withMailTelemetry` from `@nxgt/mail/telemetry`
0.9 or later (0.8 names it `withTelemetry`, which 1.0 removed); see
[Sending](docs/guide/sending.md#retrying-and-tracing-the-mailer).

| Method | Sends | To |
| --- | --- | --- |
| `verifyEmail(issued, to, options?)` | `issued` from `auth.verifyEmail.send(user)`; a link from `links.verifyEmail(issued.token)`, and how long it lasts | `issued.email` |
| `resetPassword(issued, to, options?)` | `issued` from `auth.resetPassword.request(email)`, checked for `null`; a link from `links.resetPassword(issued.token)`, and how long it lasts | `issued.email` |
| `signInCode(issued, to?, options?)` | `issued.code` from `auth.signInCode.request(email)`, and how long it lasts — **never the challenge** | `issued.email` |
| `passwordChanged(to)` | A notice, with `links.secureAccount()` | `to.email` |
| `emailChanged(to)` | A notice naming `to.newEmail`, with `links.secureAccount()` | `to.formerEmail` |
| `twoFactorEnabled(to)` | A notice: two-factor authentication was turned on, with `links.secureAccount()` | `to.email` |
| `twoFactorDisabled(to)` | A notice: two-factor authentication was turned off, with `links.secureAccount()` | `to.email` |
| `recoveryCodeUsed(to, { when, recoveryCodesLeft })` | A notice: a recovery code was used, `when`, and how many are left — "You have 9 recovery codes left." — with `links.recoveryCodes()`, else `links.secureAccount()` | `to.email` |
| `welcome(to)` | A welcome to a new user — "Welcome, Ada" — with `links.getStarted()` | `to.email` |

The three e-mails of a link or a code say how long it lasts — "This link
expires in 1 hour.", "Ce lien expire dans 1 heure." — from the flow's
`issued.expiresAt`: the time left at send time, rounded to the minute, then
down to the largest whole unit (days, hours or minutes), formatted with
`Intl.NumberFormat` in the recipient's locale. The time is read from
`janusMail({ clock })` — give it the clock you gave `janus({ clock })` —
else the system clock. Pass `{ expiresIn }` to say it yourself, as plain
text in the recipient's language.

## Usage

The examples use `mail` from above, and an `auth` whose user schema has a
`name` and a `locale` beside its `email` — fields of yours, not `janus`'s: pass
whatever your users carry.

### Verifying an e-mail

```ts
const issued = await auth.verifyEmail.send(user); // { token, email, expiresAt }
await mail.verifyEmail(issued, { name: user.name, locale: user.locale });
```

### Resetting a password

```ts
const issued = await auth.resetPassword.request(email);
if (issued !== null) {
	await mail.resetPassword(issued, { name: issued.user.name, locale: issued.user.locale });
}
return new Response(null, { status: 202 }); // the same answer whether or not someone holds the address
```

### Signing in with a code

```ts
import { parseAcceptLanguage } from '@nxgt/mail';

const issued = await auth.signInCode.request(email);
if (issued !== null) {
	const wanted = [issued.user.locale, ...parseAcceptLanguage(request.headers.get('accept-language'))];
	await mail.signInCode(issued, { locale: wanted });
	// issued.challenge stays with the visitor — a cookie or the form — never in the e-mail
}
```

### Saying the expiry yourself

```ts
await mail.verifyEmail(issued, { name: user.name, locale: 'fr' }, { expiresIn: '24 heures' });
```

### Telling a user their password or e-mail changed

`@nxgt/janus` 0.14 sends `user.passwordChanged` once `changePassword` or
`setPassword` wrote the password, and `user.emailChanged` once `update`
changed the e-mail. The e-mail change is told to the **former** address — the
new one belongs to whoever changed it — which the event carries as
`formerEmail`, `null` for a user who had none:

```ts
const auth = janus({
	...config,
	async events(event) {
		if (event.type === 'user.passwordChanged') {
			const user = await auth.get(event.userId);
			await mail.passwordChanged({ name: user.name, locale: user.locale, email: user.email });
		}
		if (event.type === 'user.emailChanged' && event.formerEmail != null) {
			const user = await auth.get(event.userId);
			await mail.emailChanged({ name: user.name, locale: user.locale, formerEmail: event.formerEmail, newEmail: user.email });
		}
	},
});
```

A reset sends `user.passwordReset`, not `user.passwordChanged`: add that type
to the first test to tell a reset too. The examples assume a required e-mail;
with an optional one, an update that removes it has no `newEmail` to name —
see [Sending](docs/guide/sending.md#emailchangedto).

### Telling a user their second factor was turned on or off

`@nxgt/janus` sends `user.secondFactorEnabled` once `secondFactor.activate`
made the factor active, and `user.secondFactorDisabled` once
`secondFactor.disable` removed an active one — never for a user who had
none. The event names the user by id, so read the rest from the user:

```ts
const auth = janus({
	...config,
	async events(event) {
		if (event.type === 'user.secondFactorEnabled' || event.type === 'user.secondFactorDisabled') {
			const user = await auth.get(event.userId);
			const to = { name: user.name, locale: user.locale, email: user.email };
			await (event.type === 'user.secondFactorEnabled' ? mail.twoFactorEnabled(to) : mail.twoFactorDisabled(to));
		}
	},
});
```

The link is `links.secureAccount()`, the page where the user manages their
security settings.

### Welcoming a new user

`@nxgt/janus` sends `user.created` once `signUp` or `create` inserted the
user. Read the user by id, and welcome them:

```ts
const auth = janus({
	...config,
	async events(event) {
		if (event.type === 'user.created') {
			const user = await auth.get(event.userId);
			await mail.welcome({ name: user.name, locale: user.locale, email: user.email });
		}
	},
});
```

The **Get started** button links to `links.getStarted()`: your home page,
or your sign-in page for an account someone else created. The welcome goes
out before the address is verified; to welcome proven addresses only, send
it on `user.emailVerified` instead — see
[Sending](docs/guide/sending.md#welcometo).

### Telling a user a recovery code was used

`@nxgt/janus` sends `user.recoveryCodeUsed` once `secondFactor.recover`
spent a code: a sign-in without the user's phone. The event names the user
by id only, so read the user, and the codes left with
`secondFactor.recoveryCodesLeft` (`@nxgt/janus` 0.11):

```ts
const auth = janus({
	...config,
	async events(event) {
		if (event.type === 'user.recoveryCodeUsed') {
			const user = await auth.get(event.userId);
			const recoveryCodesLeft = await auth.secondFactor.recoveryCodesLeft(user);
			if (recoveryCodesLeft === null) return; // the factor was turned off since
			const when = new Intl.DateTimeFormat(user.locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })
				.format(event.occurredAt);
			await mail.recoveryCodeUsed({ name: user.name, locale: user.locale, email: user.email }, { when, recoveryCodesLeft });
		}
	},
});
```

`when` is text: format it in the recipient's locale and time zone.
`recoveryCodesLeft` is the count, written as a sentence in the recipient's
locale — "You have 1 recovery code left.", "Il ne vous reste aucun code de
récupération." — or the sentence itself, as text. The button links to
`links.recoveryCodes()`, where the user regenerates their codes, and to
`links.secureAccount()` when you give no `recoveryCodes`.

### Replacing a template

Any template can be your own function — React Email, a string, another
build — and the defaults stay for the rest:

```ts
const mail = janusMail({
	mailer, from: 'noreply@acme.example', brand: 'Acme', links,
	templates: {
		signInCode: ({ code, locale }) => ({
			subject: locale === 'fr' ? `Votre code : ${code}` : `Your code: ${code}`,
			html: `<p>${code}</p>`,
			text: code,
		}),
	},
});
```

A locale beyond `en` and `fr` takes **every** template: see
[Templates](docs/guide/templates.md) and [Locales](docs/guide/locales.md).

## Traps

**Send to `issued.email`, which the methods do.** Never to what the visitor
typed: the flow answers the address the user's record holds, as they
registered it. `emailChanged` goes to `formerEmail` — the address a hijacker
just took the account from.

**Never fire and forget.** `void mail.signInCode(issued)` turns an outage
into an unhandled rejection and a user waiting for an e-mail that never
comes. `await` it, or hand it to a queue that retries — which is also how to
send after answering, as the sign-in code guide advises.

**A welcome sent from `janus({ events })` fails no sign-up.** `janus()`
awaits the listener, but a listener that throws is a `JANUS_EVENT_FAILED`
warning: the user exists, `signUp` answers, and a `MailFailure` is not
thrown to anyone. For a welcome that must arrive, put the event in a queue
that retries, and send from there.

**With open sign-up, welcome on `user.emailVerified`, not `user.created`.**
Whoever signs up picks both the address and the name, and the welcome
writes that name in its subject — "Welcome, <anything>" — so on
`user.created` anyone can make your brand send it to any address. Once the
address is proven, only its owner receives it.

**Every link is required, `getStarted` included — but `recoveryCodes`.**
`links` written for 0.3 has no `getStarted`: a compile error on `links`, and
in JavaScript `janusMail: links.getStarted must be a function`. Add it even
if you never send the welcome. `recoveryCodes` is optional: without it,
`recoveryCodeUsed` links to `secureAccount`.

**The recovery code event carries no count.** `user.recoveryCodeUsed` names
the user only; pass `recoveryCodesLeft` as
`auth.secondFactor.recoveryCodesLeft(user)` answers it, once checked for
`null` — a user whose factor was turned off since has no codes to count, and
`null` is a compile error here. With a locale the defaults are not built in,
pass the sentence rather than the count: the build has no plural for it, and
a count is a `TypeError` at send.

**`node:fs` means no edge runtime.** The default e-mails are read from the
package's `mails/` folder, on the first one sent. On an edge runtime, pass
every template yourself — or wait for the inlined build on the
[roadmap](docs/roadmap.md).

**Keep `@nxgt/janus-mail` out of your server bundle.** The default e-mails
are found beside the code, at `new URL('../mails/', import.meta.url)`.
Bundling the package into your own server file moves `import.meta.url` to
your bundle, where there is no `mails/`, and the first e-mail sent throws
`createMailRenderer: …/mails/mail-manifest.json cannot be read`. Mark it
external — `external: ['@nxgt/janus-mail']` in esbuild or `Bun.build`,
`ssr.external` in Vite — and deploy `node_modules/@nxgt/janus-mail/` whole,
`mails/` included. See
[troubleshooting](docs/troubleshooting.md#createmailrenderer-mailsmail-manifestjson-cannot-be-read--run-maizzle-build-and-deploy-its-output-folder).

**A link answers a string, at once.** Each `links` function is called at
send time and must return an `http(s)` or `mailto:` URL as a string: an
`async` function or a `URL` object is a compile error, and in JavaScript a
`TypeError` naming the call.
`links`, `from` and `replyTo` are copied when `janusMail()` is called, so
changing them afterwards changes nothing.

**Templates are own properties.** A class's methods live on its prototype
and are refused with a `TypeError`; its fields (`signInCode = (variables) =>
…`) pass.

**A locale beyond `en` and `fr` needs every template.** The defaults are
built in those two only, so `locales: ['en', 'fr', 'de']` without all nine
templates — `recoveryCodeUsed` included, since 0.5 — is a compile error, and
a `TypeError` in JavaScript.

**The brand is text only.** `brand: 'Acme'` is written in the header, the
body and the footer, escaped: no logo, no link, no markup. For those, replace
the templates.

**Send the flow's answer as it came: `expiresAt` must be a `Date`.** The
expiry is derived from `issued.expiresAt` at send time. A flow's answer that
went through JSON — a job queue — holds a string there, which is a compile
error and, in JavaScript, a `TypeError` (`expiresAt must be a Date`); revive
it with `new Date(...)`, or pass `{ expiresIn }`. An `expiresAt` already past
is a `TypeError` too: the link would not work, so nothing is sent.

**Give `janusMail()` the clock you gave `janus()`.** The time left is
measured against `clock`, the system clock by default. Tests that run
`janus({ clock: fixedClock(...) })` issue an `expiresAt` in the clock's time:
without the same `clock` here, a clock set in the past makes every send an
`expiresAt is past` `TypeError`, and one set ahead a wrong duration.

**Locales are BCP 47 tags: `fr-CA`, never `fr_CA`.** The expiry is
formatted by `Intl` in the locale picked, so a locale `Intl` refuses is a
`TypeError` from `janusMail()`:
[`janusMail: locales must be BCP 47 language tags, as 'fr-CA'`](docs/troubleshooting.md#janusmail-locales-must-be-bcp-47-language-tags-as-fr-ca).

**The expiry is formatted by the runtime's `Intl`.** A locale the runtime has
no data for is formatted in its default language, and French puts a no-break
space between the number and some units, as CLDR says. For a wording of your
own, pass `{ expiresIn }`.

**A failed send is `MAIL_FAILED`; answer it as an outage.** In an HTTP
handler, a `MailFailure` is a `503` — nothing is known to have been sent —
and a `MailRefused` (a `javascript:` link, an address that is not one) is a
bug to fix, never retried:

```ts
import { MailError } from '@nxgt/mail';

try {
	await mail.verifyEmail(await auth.verifyEmail.send(user), { name: user.name });
} catch (error) {
	if (error instanceof MailError && error.code === 'MAIL_FAILED') {
		return Response.json({ code: error.code }, { status: 503 });
	}
	throw error;
}
```

The symptoms and fixes are in [troubleshooting](docs/troubleshooting.md).

## Documentation

- [Guides](docs/README.md) — sending, templates, locales and how the e-mails are built
- [Troubleshooting](docs/troubleshooting.md) — every message this package throws, and `MailRefused`
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned

## Type safety, counted

**Thirty-six plausible mistakes, thirty-six refused at compile time.**
Six files hold one `@ts-expect-error` per mistake, beside the calls that
must keep compiling:
[`test/types/send-refusals.ts`](test/types/send-refusals.ts) the eight of a
send, 1 to 8;
[`test/types/option-refusals.ts`](test/types/option-refusals.ts) the twelve
of `janusMail()`'s options, 9 to 20, beside adding a language with every
template;
[`test/types/expiry-refusals.ts`](test/types/expiry-refusals.ts) the five of
the expiry and the clock, 21 to 25;
[`test/types/notice-refusals.ts`](test/types/notice-refusals.ts) the four of
the two-factor notices and the welcome, 26 to 29;
[`test/types/recovery-refusals.ts`](test/types/recovery-refusals.ts) the
five of the recovery code notice, 30 to 34; and
[`test/types/change-refusals.ts`](test/types/change-refusals.ts) the two of
the e-mail change notice sent on its event, 35 and 36:

1. A sign-in code given to `verifyEmail`: it has no token.
2. A one-time token given to `signInCode`: it has no code.
3. `resetPassword.request`'s answer, not checked for `null` first.
4. `verifyEmail` without the recipient.
5. A recipient without a name.
6. `passwordChanged` without the address to tell.
7. `emailChanged` without the former address.
8. A locale that is not a locale (a number).
9. `links` without `secureAccount`.
10. A link given as a URL rather than a function of the token.
11. `brand` given as an object (`{ name: 'Acme' }`) rather than its name.
12. A template that answers a string rather than `{ subject, html, text }`.
13. A template that reads a variable its e-mail does not have.
14. A template for an e-mail the package does not send.
15. A `fallbackLocale` outside `locales`.
16. A locale beyond `en` and `fr` with only some templates.
17. A default template reused for a locale it is not built in.
18. A template read from `mail.templates` that does not exist.
19. A link computed asynchronously.
20. A link answered as a `URL` object rather than its `href`.
21. A sign-in code without its `expiresAt`.
22. A flow's answer that went through JSON: `expiresAt` a string.
23. `expiresIn` given as a number of seconds rather than the text to show.
24. `expiresIn` given with the recipient rather than as the send's option.
25. `clock` given as a function rather than `@nxgt/janus`'s `Clock`.
26. The user event itself given to `twoFactorDisabled`: it has neither a name nor an address.
27. `twoFactorEnabled` given `emailChanged`'s `formerEmail` rather than `email`.
28. The `user.created` event itself given to `welcome`: it has neither a name nor an address.
29. `links` written before the welcome, without `getStarted`.
30. The `user.recoveryCodeUsed` event itself given to `recoveryCodeUsed`: it has neither a name nor an address.
31. `recoveryCodeUsed` without `when` and the count.
32. The count as `recoveryCodesLeft()` answered it, not checked for `null` first.
33. `when` given as the event's `Date` rather than the text in the recipient's locale and time zone.
34. `links.recoveryCodes` given as a URL rather than a function.
35. `user.emailChanged`'s `formerEmail` given to `emailChanged` unchecked: it is `null` for a user who had none.
36. The `user.emailChanged` event itself given to `emailChanged`: it has the former address, but neither a name nor the new one.

In JavaScript, 19 to 23, 26 to 28, 30 to 33, 35 and 36 are a `TypeError` at send
time instead, naming the call or the field, and 25, 29 and 34 one from
`janusMail()`.

[`test/types/variables.ts`](test/types/variables.ts) also holds
`JanusMailVariables` equal to the variables of the build: an e-mail that
gains or loses one fails the typecheck.

## Licence

MIT
