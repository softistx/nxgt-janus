# Sending

This page is for wiring `janusMail()` into an application: what it takes,
what each method sends and to whom, what happens when a send fails, and how
to test it.

```ts
import { janus, createMemoryStores, scryptHasher } from '@nxgt/janus';
import { janusMail } from '@nxgt/janus-mail';
import { createSmtpMailer } from '@nxgt/mail-smtp'; // or any @nxgt/mail transport
import { z } from 'zod';

export const auth = janus({
	user: z.object({ email: z.email(), name: z.string(), locale: z.string().nullable() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

export const mail = janusMail({
	mailer: createSmtpMailer({ transporter }), // transporter: nodemailer.createTransport(…)
	from: { name: 'Acme', address: 'noreply@acme.example' },
	replyTo: 'support@acme.example',
	brand: 'Acme',
	links: {
		verifyEmail: (token) => `https://acme.example/verify?token=${encodeURIComponent(token)}`,
		resetPassword: (token) => `https://acme.example/reset?token=${encodeURIComponent(token)}`,
		secureAccount: () => 'https://acme.example/account/security',
		getStarted: () => 'https://acme.example/',
		recoveryCodes: () => 'https://acme.example/account/recovery-codes', // optional
	},
});
```

Create it once, at start-up, beside `janus()`. It reads nothing when called:
the default e-mails are read from the package's `mails/` folder the first
time one is sent, and kept.

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `mailer` | `Mailer` | required | The transport every e-mail is handed to |
| `from` | `Address` | required | The sender: `'noreply@acme.example'` or `{ name, address }` |
| `replyTo` | `Address` | none | Where a reply goes, when not to `from` |
| `brand` | `string` | required | The name the e-mails show, in the header, the body and the footer. Text: escaped in the HTML |
| `links.verifyEmail` | `(token) => string` | required | The page that confirms an address, given the one-time token |
| `links.resetPassword` | `(token) => string` | required | The page that sets a new password, given the one-time token |
| `links.secureAccount` | `() => string` | required | Where a user who made no change secures their account: the notices link to it |
| `links.getStarted` | `() => string` | required | Where a new user starts — your home page, or your sign-in page for an account someone else created: the welcome's **Get started** button links to it |
| `links.magicLink` | `(token) => string` | none: `magicLink` is a `TypeError` without it | The page a sign-in link opens, given the one-time token. That page spends nothing: its button posts the token to the route that calls `auth.magicLink.confirm` |
| `links.recoveryCodes` | `() => string` | `links.secureAccount` | Where a user regenerates their recovery codes: the recovery code notice links to it, from its **Secure my account** button |
| `locales` | `readonly L[]` | `['en', 'fr']` | The locales sent in — see [Locales](locales.md) |
| `fallbackLocale` | one of `locales` | `'en'`, else the first of `locales` | The locale when the recipient wants none of `locales` |
| `templates` | `Partial<JanusMailTemplates<L>>` | none | Your own templates, over the defaults — see [Templates](templates.md) |
| `clock` | `Clock` from `@nxgt/janus` | the system clock | What the time left until a flow's `expiresAt` is measured against — pass the one `janus({ clock })` was given; see [The expiry](#the-expiry) |

Every link is called at send time, and must answer an absolute `http:`,
`https:` or `mailto:` URL: a default template refuses anything else with
`MailRefused`, before the mailer is called. `mailto:` is accepted on purpose:
`secureAccount: () => 'mailto:security@acme.example'` points a user who made
no change at your support desk. A link must be answered synchronously, as a
string — an `async` function or a `URL` object is a compile error in
TypeScript, and a `TypeError` naming the call at send time in JavaScript,
`janusMail.verifyEmail: links.verifyEmail(token) must answer a string`.
Encode a token you put in a query string yourself (`encodeURIComponent`).

`links`, `from` and `replyTo` are copied and frozen when `janusMail()` is
called: what was checked then is what every send uses, and changing your
object afterwards changes nothing.

A wrong option is a bare `TypeError` when `janusMail()` is called, naming the
option and never its value — every message is in
[troubleshooting](../troubleshooting.md#wiring--janusmail).

## The methods

Each method renders its e-mail with its template, hands it to the mailer,
and answers the mailer's `SentMail` (`{ messageId }`).

### `verifyEmail(issued, to, options?)`

```ts
const issued = await auth.verifyEmail.send(user); // IssuedToken: { token, email, expiresAt }
await mail.verifyEmail(issued, { name: user.name, locale: user.locale });
```

Sent to `issued.email`, with the link `links.verifyEmail(issued.token)` and
how long it lasts — see [The expiry](#the-expiry).

### `resetPassword(issued, to, options?)`

```ts
const issued = await auth.resetPassword.request(email); // (IssuedToken & { user }) | null
if (issued !== null) {
	await mail.resetPassword(issued, { name: issued.user.name, locale: issued.user.locale });
}
```

`request` answers `null` for an address nobody holds, and the compiler
refuses `null` here: check it first, and answer the visitor the same either
way. Sent to `issued.email`, with `links.resetPassword(issued.token)` and how
long it lasts.

### `signInCode(issued, to?, options?)`

```ts
const issued = await auth.signInCode.request(email); // IssuedCode: { code, challenge, email, expiresAt, user } | null
if (issued !== null) await mail.signInCode(issued, { locale: issued.user.locale });
```

It reads `issued.code`, `issued.email` and `issued.expiresAt`, **and nothing
else**: the
challenge is the visitor's secret, and neither the default template nor an
override is ever given it. `to` is optional — the e-mail greets nobody by
name — and only its `locale` is read.

### `magicLink(issued, to?, options?)`

```ts
const issued = await auth.magicLink.request(email); // IssuedToken & { user } | null
if (issued !== null) await mail.magicLink(issued, { locale: issued.user.locale });
return new Response(null, { status: 202 }); // the same answer either way
```

`request` answers `null` for an address nobody holds, and for an inactive
user; the compiler refuses `null` here. Sent to `issued.email`, with a
**Sign in** button to `links.magicLink(issued.token)` and how long it lasts —
"This link expires in 15 minutes." `to` is optional — the e-mail greets
nobody by name — and only its `locale` is read.

- **`links.magicLink` is required to send it.** It is optional in
  `janusMail()`, for an application that sends no sign-in link, and without
  it `magicLink` throws a `TypeError` —
  `janusMail.magicLink: links.magicLink is missing — …` — before anything is
  rendered. There is no fallback: only your page can carry the token.
- **Link to a page, never to the route that signs in.** Mail scanners open
  every link in an e-mail; one that signs in on `GET` signs in for the
  scanner, and the user's click answers `TOKEN_SPENT`. The page's button
  posts the token to the route calling `auth.magicLink.confirm` —
  [`@nxgt/janus`'s sign-in link guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/magic-link.md)
  has it, and [`@nxgt/janus-hono`'s routes](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-hono/docs/guide/routes.md#a-link-sent-by-e-mail)
  the same on Hono.
- **A sign-in code is not a link.** Its answer has a `challenge`, the
  visitor's secret, and no `token`: the compiler refuses it here, and
  JavaScript gets `janusMail.magicLink: token must be a string`.

### `passwordChanged(to)`

```ts
// On the user event @nxgt/janus 0.14 sends once the password is written:
const auth = janus({
	...config,
	async events(event) {
		if (event.type !== 'user.passwordChanged') return;
		const user = await auth.get(event.userId);
		await mail.passwordChanged({ name: user.name, locale: user.locale, email: user.email });
	},
});
```

A notice: the password of the account at `to.email` changed, with a link to
`links.secureAccount()` for a user who did not change it. Send it on the
`user.passwordChanged` event, which `changePassword` and `setPassword` send —
and, from `@nxgt/janus` 0.16, `signInCode.confirm` and `magicLink.confirm`
when their first proof of the e-mail dropped a password someone may have set
without holding the inbox. A reset sends `user.passwordReset` instead, never both: to tell a reset too,
send the same notice on that type — `event.type === 'user.passwordChanged'
|| event.type === 'user.passwordReset'`. The event names the user by id
alone, so read the name, the locale and the address from the user.
`setPassword` sends it for a user's first password too — an account created
without one — so the notice then tells them a password was set on their
account, which is worth knowing all the same.

### `emailChanged(to)`

```ts
// On the user event @nxgt/janus 0.14 sends when an update changed the e-mail:
const auth = janus({
	...config,
	async events(event) {
		if (event.type !== 'user.emailChanged' || event.formerEmail == null) return;
		const user = await auth.get(event.userId);
		await mail.emailChanged({ name: user.name, locale: user.locale, formerEmail: event.formerEmail, newEmail: user.email });
	},
});
```

Sent to **`formerEmail`**: the owner of the old address is the one to warn,
since whoever changed it already controls the new one. It names `newEmail`,
and links to `links.secureAccount()`. The `user.emailChanged` event is the
one that carries an address — `event.formerEmail`, the e-mail before the
update — since the user read back already holds the new one. It is `null`
for a user who had no e-mail before: there is no former inbox to tell, and
the type refuses it unchecked. The example assumes a required e-mail: with
an optional one, `update` also sends the event when it removes the address,
and the user read back has no `newEmail` to name — check `user.email` first,
and tell the former address your own way or not at all.

### `twoFactorEnabled(to)` and `twoFactorDisabled(to)`

```ts
// On the user events @nxgt/janus sends once the write landed:
const auth = janus({
	...config,
	async events(event) {
		if (event.type !== 'user.secondFactorEnabled' && event.type !== 'user.secondFactorDisabled') return;
		const user = await auth.get(event.userId);
		const to = { name: user.name, locale: user.locale, email: user.email };
		await (event.type === 'user.secondFactorEnabled' ? mail.twoFactorEnabled(to) : mail.twoFactorDisabled(to));
	},
});
```

Two notices: two-factor authentication was turned on, or off, for the account
at `to.email`, each with a link to `links.secureAccount()` — the user's
security settings — for a user who did not make the change. Send
`twoFactorEnabled` on the `user.secondFactorEnabled` event, which
`auth.secondFactor.activate` sends once the factor is active, and
`twoFactorDisabled` on `user.secondFactorDisabled`, which
`auth.secondFactor.disable` sends only when it removed an active factor: a
`disable` on a user who had none tells nobody anything. From `@nxgt/janus`
0.16, `signInCode.confirm` and `magicLink.confirm` send it too when their
first proof of the e-mail removed a factor someone may have enrolled without
holding the inbox — after `user.passwordChanged`, so the inbox's owner gets
both notices. The event names the user by id alone, so read the name, the
locale and the address from the user. Calling them right after `activate` or
`disable` answered works as well — without the events, check `hasSecondFactor`
before the `disable`.

### `welcome(to)`

```ts
// On the user event @nxgt/janus sends once the user is inserted:
const auth = janus({
	...config,
	async events(event) {
		if (event.type !== 'user.created') return;
		const user = await auth.get(event.userId);
		await mail.welcome({ name: user.name, locale: user.locale, email: user.email });
	},
});
```

Welcomes the new user at `to.email` — "Welcome, Ada", "Bienvenue, Ada", the
name in the subject too — with a **Get started** button that links to
`links.getStarted()`: your home page, or your sign-in page when the account
was created for the user rather than by them. Send it on the `user.created`
event, which `auth.signUp` and `auth.create` send once the user is inserted —
even when `signUp`'s session then fails to open — and never for a sign-up
refused. The event names the user by id alone, so read the name, the locale
and the address from the user. With several user types, check
`event.userType` first: a type with no e-mail has nobody to welcome.

- **It goes out before the address is verified.** A sign-up with a mistyped
  address welcomes whoever holds it, and with open sign-up anyone can make
  your brand send "Welcome, <any name>" to any address. To welcome proven addresses only, send
  it on `user.emailVerified` instead, sent once the address is proven —
  and again after an address changed and was proven anew, so welcome only
  a user you have not welcomed before.
- **A failed welcome fails no sign-up.** `janus()` awaits the listener, but a
  listener that throws is a `JANUS_EVENT_FAILED` warning: the user exists,
  and `signUp` answers as it would have. For a welcome that must arrive, put
  the event in a queue that retries a `MAIL_FAILED`, and send from there.

### `recoveryCodeUsed(to, { when, recoveryCodesLeft })`

```ts
// On the user event @nxgt/janus sends once a recovery code is spent:
const auth = janus({
	...config,
	async events(event) {
		if (event.type !== 'user.recoveryCodeUsed') return;
		const user = await auth.get(event.userId);
		const recoveryCodesLeft = await auth.secondFactor.recoveryCodesLeft(user); // @nxgt/janus 0.11
		if (recoveryCodesLeft === null) return; // the factor was turned off since
		const when = new Intl.DateTimeFormat(user.locale, {
			dateStyle: 'long',
			timeStyle: 'short',
			timeZone: user.timeZone, // a field of yours, when you keep one
		}).format(event.occurredAt);
		await mail.recoveryCodeUsed(
			{ name: user.name, locale: user.locale, email: user.email },
			{ when, recoveryCodesLeft },
		);
	},
});
```

A notice for the account at `to.email`: a recovery code was used — a
sign-in without the user's phone — at `when`, and how many codes are left,
with a **Secure my account** button. Send it on the `user.recoveryCodeUsed`
event, which `auth.secondFactor.recover` sends once the code is spent, even
when opening the session then fails.

- **`when` is text you write**, in the recipient's locale and time zone:
  "28 septembre 2026 à 14:05". The event's `occurredAt` is when the code
  was spent.
- **`recoveryCodesLeft` is the count, or the sentence.** The event does not
  carry it: `auth.secondFactor.recoveryCodesLeft(user)` reads it after the
  write, the code just spent already out, and answers `null` for a user
  with no active factor — check it, the compiler asks you to. A count is
  written as `@nxgt/mail-presets`' plural in the recipient's locale: "You
  have no recovery codes left.", "You have 1 recovery code left.", "Il vous
  reste 9 codes de récupération." — the build's own catalogue, parsed when
  this package is built, and formatted at send time with the locale's
  plural rules. Text is sent as it is: pass the sentence yourself for
  another wording, or a locale the defaults are not built in, where a count
  is a `TypeError`.
- **The link is `links.recoveryCodes()`**, where the user regenerates their
  codes; without it, `links.secureAccount()`. `recoveryCodes` is optional,
  so a `links` written for 0.4 still compiles.

## The expiry

`verifyEmail`, `resetPassword`, `signInCode` and `magicLink` say how long
the link or the code lasts — "This link expires in 1 hour.", "Ce code expire dans
10 minutes." The text is `expiresIn`, one of the template's variables,
derived at send time from the flow's `issued.expiresAt`:

1. the time left until `expiresAt`, rounded to the minute — the flow set it a
   moment ago, so an hour is still "1 hour";
2. then **down** to the largest whole unit it holds — days, hours or minutes
   — so, at 30 seconds or more, the e-mail never promises more than half a
   minute beyond what is left; under that, it says "1 minute". 90 minutes is
   "1 hour", 36 hours "1 day";
3. formatted by `Intl.NumberFormat` with `style: 'unit'` and
   `unitDisplay: 'long'`, in the recipient's locale: "3 hours", "3 heures".

With `@nxgt/janus`'s defaults, a verification link says "1 day", a reset
link "1 hour" and a sign-in code "10 minutes".

The time is `janusMail({ clock })`'s — pass the clock `janus({ clock })` was
given, a `fixedClock` in tests — else the system clock:

```ts
import { fixedClock } from '@nxgt/janus';

const clock = fixedClock(Date.UTC(2026, 0, 1));
const auth = janus({ /* … */ clock });
const mail = janusMail({ mailer, from, brand: 'Acme', links, clock });
```

To say it yourself — another wording, or a locale the runtime's `Intl` has no
data for — pass `expiresIn` as the third argument, plain text already in the
recipient's language. `expiresAt` is then not read:

```ts
await mail.verifyEmail(issued, { name: user.name, locale: 'fr' }, { expiresIn: '24 heures' });
await mail.signInCode(issued, undefined, { expiresIn: 'ten minutes' });
```

A send whose `expiresAt` is not a valid `Date` — a flow's answer that went
through JSON on its way to a queue holds a string — or is already past, is
a `TypeError`, and nothing reaches the mailer: revive the date with
`new Date(issued.expiresAt)` when the job runs, or pass `expiresIn`.

## Where each e-mail goes

| Method | To | Never to |
| --- | --- | --- |
| `verifyEmail` | `issued.email` | what the visitor typed |
| `resetPassword` | `issued.email` | the `email` passed to `request` |
| `signInCode` | `issued.email` | the `email` passed to `request` |
| `magicLink` | `issued.email` | the `email` passed to `request` |
| `passwordChanged` | `to.email` | — |
| `emailChanged` | `to.formerEmail` | `to.newEmail` |
| `twoFactorEnabled`, `twoFactorDisabled` | `to.email` | — |
| `recoveryCodeUsed` | `to.email` | — |
| `welcome` | `to.email` | — |

`issued.email` is the address the user's record holds, as they registered
it; what the visitor typed may differ in case or spacing. The recipient is a
bare address: `to.name` is used in the greeting, not in the `To` header.

Only `subject`, `html` and `text` are read from what a template answers. A
template cannot add a recipient or a header: `to`, `from`, `replyTo` and
`headers` are this package's alone.

## When a send fails

**Every method rejects with the error it met, untouched.** This package
defines no error class and wraps nothing:

| Error | From | Means | Answer |
| --- | --- | --- | --- |
| `MailFailure` (`MAIL_FAILED`) | the mailer | The transport could not hand the e-mail over. Nothing is known to have been sent | A `503`, or a retry from a queue |
| `MailRefused` (`MAIL_REFUSED`) | the renderer, or the mailer | The e-mail itself is wrong: a link that is not `http:`, `https:` or `mailto:`, an address that is not one | A bug to fix; sending it again fails again |
| `TypeError` | this package, or the renderer | A call without the value a flow answered — `janusMail.resetPassword: token must be a string` — or, in JavaScript, a link that is not a string (a compile error in TypeScript) — `janusMail.verifyEmail: links.verifyEmail(token) must answer a string`. For [the expiry](#the-expiry): `janusMail.<method>: expiresAt must be a Date`, `janusMail.<method>: expiresAt is past — the link or code would not work`, `janusMail.<method>: expiresIn must be a string`, `janusMail.<method>: clock.now() must answer a Date` | A bug to fix — for a past `expiresAt`, issue a new token or code and send that |
| `Error` from `createMailRenderer` | the renderer | `mails/` is missing where the package runs: a bundler inlined `@nxgt/janus-mail`, or a deploy kept `dist/` only | Keep `@nxgt/janus-mail` external to your bundle and deploy its `mails/` with it; see [troubleshooting](../troubleshooting.md#createmailrenderer-mailsmail-manifestjson-cannot-be-read--run-maizzle-build-and-deploy-its-output-folder) |

`instanceof` holds against the classes of your own `@nxgt/mail`, since it is
a peer: one copy defines them.

```ts
import { MailError } from '@nxgt/mail';
import { JanusError } from '@nxgt/janus';

export async function sendVerification(user: User): Promise<Response> {
	try {
		await mail.verifyEmail(await auth.verifyEmail.send(user), { name: user.name, locale: user.locale });
		return new Response(null, { status: 202 });
	} catch (error) {
		if (error instanceof MailError && error.code === 'MAIL_FAILED') {
			return Response.json({ code: 'MAIL_FAILED' }, { status: 503 }); // offer to send it again
		}
		if (error instanceof JanusError && error.code === 'STORE_FAILED') {
			return Response.json({ code: 'STORE_FAILED' }, { status: 503 });
		}
		throw error; // MAIL_REFUSED and TypeError are bugs: a 500
	}
}
```

**Never fire and forget.** `void mail.signInCode(issued)` turns a failure
into an unhandled rejection. The [sign-in code guide of
`@nxgt/janus`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/sign-in-code.md)
advises sending *after* answering, so the time an answer takes does not tell
whether the address exists: hand the send to a queue that awaits it and
retries a `MAIL_FAILED`, rather than to a promise nobody awaits.

### Retrying and tracing the mailer

Wrap the mailer before you hand it to `janusMail()`: `withRetry`, from
`@nxgt/mail` 0.8 or later, retries a `MailFailure` with backoff, reusing one
idempotency key for every attempt, and never retries a `MailRefused` — its
options are `MailRetryOptions` since 1.0, which removed the older name
`RetryOptions`; `withMailTelemetry`, from `@nxgt/mail/telemetry` 0.9 or
later (`withTelemetry` on 0.8, removed in 1.0), opens a `mail.send` span
per send. That entry
needs `@opentelemetry/api` installed (an optional peer, loaded by it alone);
with no OpenTelemetry SDK registered, its spans are no-ops. Put telemetry on the outside, so one
send is one span:

```ts
import { janusMail } from '@nxgt/janus-mail';
import { withRetry } from '@nxgt/mail';
import { withMailTelemetry } from '@nxgt/mail/telemetry';
import { createSmtpMailer } from '@nxgt/mail-smtp';

export const mail = janusMail({
	mailer: withMailTelemetry(withRetry(createSmtpMailer({ transporter })), { transport: 'smtp' }),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links, // transporter and links: as in the example at the top
});
```

**Two telemetries, unrelated.** `@nxgt/telemetry` — which
`@nxgt/janus-telemetry` peers — exports `withTelemetry(telemetry, fn)`,
which scopes a telemetry to a block. `mail.send` is recorded through
OpenTelemetry, not `@nxgt/telemetry`, so it does not nest under
`@nxgt/janus-telemetry`'s spans. `@nxgt/mail` 0.9 renamed its decorator
`withMailTelemetry` so the two no longer share a name, and 1.0 removed the
old `withTelemetry` — with `withRendererTelemetry`, which
`@nxgt/mail/telemetry` 1.0 names `withMailRendererTelemetry`. On 0.8, import
its `withTelemetry` under another name when a module uses both.

**SMTP ignores the idempotency key**, so a retry after an ambiguous SMTP
timeout can deliver an e-mail twice. If a duplicate sign-in code or reset
link is not acceptable, leave an SMTP mailer unretried (`{ attempts: 1 }`,
or no `withRetry`). See `@nxgt/mail`'s
[sending guide](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail/docs/guide/sending.md#retrying--withretry).

## Testing

`createMemoryMailer()` from `@nxgt/mail` keeps an outbox, and can be told to
fail:

```ts
import { expect, it } from 'bun:test';
import { fixedClock } from '@nxgt/janus';
import { createMemoryMailer, MailFailure } from '@nxgt/mail';
import { janusMail } from '@nxgt/janus-mail';

// The clock given to janus({ clock }) too: the codes it issues expire ten minutes on.
const clock = fixedClock(Date.UTC(2026, 0, 1, 9));
const expiresAt = new Date(Date.UTC(2026, 0, 1, 9, 10));

const links = {
	verifyEmail: (token: string) => `https://acme.example/verify?token=${token}`,
	resetPassword: (token: string) => `https://acme.example/reset?token=${token}`,
	secureAccount: () => 'https://acme.example/account/security',
	getStarted: () => 'https://acme.example/',
};

it('sends the code, and never the challenge', async () => {
	const mailer = createMemoryMailer();
	const mail = janusMail({ mailer, from: 'noreply@acme.example', brand: 'Acme', links, clock });
	const issued = { code: '042817', challenge: 'secret', email: 'ada@example.com', expiresAt };

	await mail.signInCode(issued, { locale: 'fr-CA' });

	const [sent] = mailer.sent;
	expect(sent?.to).toBe('ada@example.com');
	expect(sent?.subject).toBe('Votre code de connexion : 042817');
	expect(sent?.text).toContain('10 minutes.');
	expect(`${sent?.html}${sent?.text}`).not.toContain('secret');
});

it('says so when the mailer is down', async () => {
	const mailer = createMemoryMailer();
	mailer.failNext();
	const mail = janusMail({ mailer, from: 'noreply@acme.example', brand: 'Acme', links, clock });

	const error = await mail
		.signInCode({ code: '042817', email: 'ada@example.com', expiresAt })
		.then(() => null, (e: unknown) => e); // settled where it is created

	expect(error).toBeInstanceOf(MailFailure);
	expect(mailer.attempts).toBe(1); // tried once: nothing retried in secret
});
```

## See also

- [Templates](templates.md) — replacing an e-mail.
- [Locales](locales.md) — how the locale is picked.
- `@nxgt/mail`'s
  [sending guide](https://github.com/softistx/nxgt-mail/blob/develop/packages/mail/docs/guide/sending.md)
  — the `Mailer` port and its errors.
