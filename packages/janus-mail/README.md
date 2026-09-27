# @nxgt/janus-mail

The e-mails of [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus)'s
flows, ready to send: **e-mail verification, password reset, sign-in code,
password changed and e-mail changed**, in English and French, with your brand
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
	},
});

await mail.verifyEmail(await auth.verifyEmail.send(user), { name: user.name, locale: user.locale });
```

The e-mails are built with [Maizzle](https://maizzle.com) when **this
package** is built — from
[`@nxgt/mail-presets`](https://www.npmjs.com/package/@nxgt/mail-presets),
CSS inlined for mail clients — and shipped as HTML and text. At send time
they are only filled in: your brand, the recipient's name, your links, every
value escaped. No template engine and no Maizzle run in your server.

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-mail @nxgt/mail @nxgt/janus
bun add -d typescript
```

Three peers, all required: `@nxgt/mail` (0.1 or later, below 1 — the
transports of 0.4 included), which defines the `Mailer` port and the errors;
`@nxgt/janus` (0.8), whose flows' answers the methods take — types only,
nothing of it is loaded; and `typescript` (6). **No Maizzle, no Vue, no
Tailwind**: they run at this package's build, not in yours.

It reads its prebuilt e-mails with `node:fs`: **Node, Bun or Deno**, not an edge
runtime. Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`.

## API

| Export | What it is |
| --- | --- |
| `janusMail(options)` | The e-mails, over your mailer: `verifyEmail`, `resetPassword`, `signInCode`, `passwordChanged`, `emailChanged`, and `templates` and `locales`. Options: `mailer`, `from`, `replyTo?`, `brand`, `links` (`verifyEmail`, `resetPassword`, `secureAccount`), `locales?`, `fallbackLocale?`, `templates?`. A wrong option is a bare `TypeError`, thrown here |
| `janusTemplates()` | The five default templates alone, each `(variables & { locale }) => Rendered` |
| `JanusMail<L>`, `JanusMailOptions<L>` | What `janusMail()` answers and takes, for the locales `L` |
| `JanusMailTemplate<V, L>`, `JanusMailTemplates<L>`, `JanusMailTemplateName` | One template, the five of them, and their names |
| `JanusMailVariables` | What each template is given: `brand`, and `name`, `link`, `code` or `newEmail` as its e-mail needs |
| `JanusMailLocale` | `'en' \| 'fr'`: the locales the defaults are built in |
| `JanusMailLinks`, `Recipient` | The `links` option; who an e-mail is for — `{ name, locale? }` |

Each method answers the mailer's `SentMail` and **rejects with the mailer's
`MailFailure` or `MailRefused`, untouched**: this package defines no error
class.

| Method | Sends | To |
| --- | --- | --- |
| `verifyEmail(issued, to)` | `issued` from `auth.verifyEmail.send(user)`; a link from `links.verifyEmail(issued.token)` | `issued.email` |
| `resetPassword(issued, to)` | `issued` from `auth.resetPassword.request(email)`, checked for `null`; a link from `links.resetPassword(issued.token)` | `issued.email` |
| `signInCode(issued, to?)` | `issued.code` from `auth.signInCode.request(email)` — **never the challenge** | `issued.email` |
| `passwordChanged(to)` | A notice, with `links.secureAccount()` | `to.email` |
| `emailChanged(to)` | A notice naming `to.newEmail`, with `links.secureAccount()` | `to.formerEmail` |

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

### Telling a user their password changed

```ts
const changed = await auth.changePassword(user, { current, next });
await mail.passwordChanged({ name: changed.name, locale: changed.locale, email: changed.email });
```

### Telling a user their e-mail changed

```ts
const before = user.email;
const updated = await auth.update(user, { email: next });
await mail.emailChanged({ name: updated.name, locale: updated.locale, formerEmail: before, newEmail: updated.email });
```

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
`async` function or a `URL` object is a `TypeError` naming the call.
`links`, `from` and `replyTo` are copied when `janusMail()` is called, so
changing them afterwards changes nothing.

**A locale beyond `en` and `fr` needs every template.** The defaults are
built in those two only, so `locales: ['en', 'fr', 'de']` without all five
templates is a compile error, and a `TypeError` in JavaScript.

**The brand is text only.** `brand: 'Acme'` is written in the header, the
body and the footer, escaped: no logo, no link, no markup. For those, replace
the templates.

**The default e-mails do not state the expiry.** `@nxgt/mail-presets`' bodies
say nothing of how long a link or a code lasts. If yours must, replace the
template: `issued.expiresAt` is yours to format.

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

**Eighteen plausible mistakes, eighteen refused at compile time.**
[`test/types/refusals.ts`](test/types/refusals.ts) holds one
`@ts-expect-error` per mistake, beside the calls that must keep compiling —
among them adding a language with every template:

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

[`test/types/variables.ts`](test/types/variables.ts) also holds
`JanusMailVariables` equal to the variables of the build: an e-mail that
gains or loses one fails the typecheck.

## Licence

MIT
