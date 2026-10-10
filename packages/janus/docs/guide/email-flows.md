# E-mail verification and password reset

This page is for the two one-time-token flows: proving a user holds their
e-mail, and resetting a forgotten password. `janus` issues and redeems the
tokens; **sending the e-mail is yours**.

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';

async function sendMail(to: string, link: string): Promise<void> {
	// your mailer
}

const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const { user } = await auth.signUp({ email: 'ada@example.com', name: 'Ada', password: 'correct horse' });

const sent = await auth.verifyEmail.send(user); // { token, email, expiresAt }
await sendMail(sent.email, `https://app.example/verify?token=${sent.token}`);

// when the link is followed: the token comes back from the query string
const verified = await auth.verifyEmail.confirm(sent.token);
verified.emailVerified; // true
```

## Ready-made e-mails — `@nxgt/janus-mail`

`sendMail` above is yours to write, or
[`@nxgt/janus-mail`](https://www.npmjs.com/package/@nxgt/janus-mail)
writes it: it takes what `send` and `request` answer, as they answer it, and
sends the verification, reset, sign-in code and sign-in link e-mails — with the notices
of a password, an e-mail or a second factor changed, and a welcome on
`user.created` — in English and French, over any `@nxgt/mail` transport.
Every link is required but two: `getStarted`, since janus-mail 0.4.0, is
where the welcome's **Get started** button leads; `recoveryCodes` and
`magicLink` — the page a [sign-in link](magic-link.md) opens, since
janus-mail 0.7.0 — are optional.

```ts
import { janusMail } from '@nxgt/janus-mail';

const mail = janusMail({
	mailer, // an @nxgt/mail transport
	from: 'noreply@app.example',
	brand: 'App',
	links: {
		verifyEmail: (token) => `https://app.example/verify?token=${token}`,
		resetPassword: (token) => `https://app.example/reset?token=${token}`,
		secureAccount: () => 'https://app.example/account/security',
		getStarted: () => 'https://app.example/',
	},
});

await mail.verifyEmail(await auth.verifyEmail.send(user), { name: user.name });

const issued = await auth.resetPassword.request(email);
if (issued !== null) await mail.resetPassword(issued, { name: issued.user.name });
```

Each e-mail goes to `issued.email`. A send that fails rejects with the
mailer's `MailFailure` — never report it as sent — and one refused, a link
that is not `http(s)` or `mailto:` or an address that is not one, with
`MailRefused`. A `mailto:` link is accepted on purpose —
`secureAccount: () => 'mailto:security@app.example'` points a user who made
no change at your support desk. Each link must answer a string at once: an
`async` function is a `TypeError` naming the call.

## Which types have these flows

`verifyEmail` exists on a type with an e-mail field: the one `email` names, or
a required string field called `email`. `resetPassword` needs an e-mail **and**
a password. On a type without them the flows are **absent from its type**, not
failing at run time:

```ts
const clinic = janus({
	users: {
		staff: { schema: z.object({ username: z.string() }), password: { login: 'username' } },
		patient: { schema: z.object({ contact: z.email() }), password: { login: 'contact' }, email: 'contact' },
	},
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

clinic.patient.verifyEmail.send; // exists: `email` names the field
// @ts-expect-error — staff has no e-mail, so no verifyEmail
clinic.staff.verifyEmail;
```

A type with an e-mail can also sign in with a code or a link sent to it,
with or without a password — see [sign-in codes](sign-in-code.md) and
[sign-in links](magic-link.md).

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `email` | a field name | `'email'` | The field the tokens are sent to, per type |
| `tokens.verifyEmail` | `Duration` | `'24h'` | How long a verification token lives |
| `tokens.resetPassword` | `Duration` | `'1h'` | How long a reset token lives |

## `verifyEmail`

```ts
readonly verifyEmail: {
	send(user: UserRef): Promise<IssuedToken>; // { token, email, expiresAt }
	confirm(token: string): Promise<User>;
};
```

`send` issues a token for the user's **current** e-mail. It is throttled
**per user**, five per 10-minute window: past it, `MailThrottledError`
(`MAIL_THROTTLED`, with `userId`) and no token. The application calls it for a
user it knows, so an unauthenticated loop on the address cannot spend the
count, and a user who changes e-mail buys no extra sends. `confirm` redeems it
and sets `emailVerified`. A token sent to an e-mail the user has since changed
is `TOKEN_STALE`: confirming it would verify an address nobody holds any more.
The address is checked again on the very record the write replaces, so an
e-mail changed while the link is being redeemed is `TOKEN_STALE` too, and
nothing is written.
A confirm that verifies the e-mail sends a [`user.emailVerified`
event](events.md); one for an e-mail already verified sends nothing.
Changing the e-mail with `update` sets `emailVerified` back to `false` — and
the next sign-in by code or link then [drops the password and the second
factor, and signs out every session](magic-link.md#an-account-someone-else-registered).

## `resetPassword`

```ts
readonly resetPassword: {
	request(email: string): Promise<(IssuedToken & { user: User }) | null>;
	prepare(email: string): Promise<PreparedRequest<IssuedToken & { user: User }>>; // { send() }, below
	confirm(token: string, password: string): Promise<User>;
};
```

`request` answers `null` for an e-mail nobody holds. **Never tell the visitor
which**: answer the same page either way.

```ts
export async function forgotPassword(request: Request): Promise<Response> {
	const { email } = (await request.json()) as { email: string };
	const issued = await auth.resetPassword.request(email);
	if (issued !== null) {
		await sendMail(issued.email, `https://app.example/reset?token=${issued.token}`);
	}
	return new Response(null, { status: 202 }); // the same answer either way
}
```

**At most one reset link is live per user.** A `request` issues its link,
then spends every other reset link of the user, so the link in an earlier
e-mail answers `TOKEN_SPENT` — only the last one works, as for [sign-in
codes](sign-in-code.md):

```ts
const first = await auth.resetPassword.request(email);
const second = await auth.resetPassword.request(email); // the visitor asked again
if (first !== null && second !== null) {
	await auth.resetPassword.confirm(first.token, newPassword);  // TOKEN_SPENT
	await auth.resetPassword.confirm(second.token, newPassword); // reset
}
```

Requests that arrive at once cannot each keep a link: each spends the
others' once it issued its own, so at most one survives — sometimes none, and
the visitor asks again. **`request` is throttled per address**, as for
sign-in codes: each one sends an e-mail and cancels the link before it, so
past five requests for one address in a 10-minute window it throws
`MailThrottledError` (`MAIL_THROTTLED`) and issues nothing; the link last sent
still works. An address nobody holds is counted and refused alike, and under
the limit still answers `null`. Somebody who knows an address can fill its
inbox with at most five reset e-mails a window, but cannot shut the reset:
the last one sent still works. Limit the route per client yourself too, and
see [the mail throttle](#requests-that-send-e-mail-are-throttled).

`request`'s time still tells an account from nobody — a lookup, then a link
written and the earlier ones spent, against a lookup alone. To keep that off
the visitor's request and still answer them `MAIL_THROTTLED`, call
`resetPassword.prepare(email)` there and its `send()` in the background:
[requests in two steps](#requests-in-two-steps).

**Writing a password spends every reset link still live.** A `confirm`,
`changePassword` and `setPassword` each do, so a link sent before the
password changed cannot replace it again:

```ts
const issued = await auth.resetPassword.request(email);
await auth.changePassword(user, { current, next });
if (issued !== null) {
	await auth.resetPassword.confirm(issued.token, other); // TOKEN_SPENT
}
```

The links are spent **after** the password is written, so a link issued
during the write is spent too. If the store fails at that step, the call
rejects with `STORE_FAILED` although the password is written — answer 503 as
usual — and the older links may still be live until the next `request`,
which spends them. Sign-in codes, sign-in links and step-ups are not spent:
the password proves none of them.

`confirm` sets the password, marks the e-mail verified — the link proved it —
and **signs the user out everywhere**: their sessions are revoked, and every
second-factor challenge still open is spent, so a sign-in started with the
old password cannot be finished. The e-mail is checked again on the record
written, as for `verifyEmail`. It sends a [`user.passwordReset` event](events.md),
then `user.emailVerified` when the link verified the e-mail. It opens no session: call `signIn` next
if that is your policy. A password refused for its length does not spend the
token, so the visitor can try again with the same link.

```ts
import { JanusError } from '@nxgt/janus';

export async function resetPassword(request: Request): Promise<Response> {
	const { token, password } = (await request.json()) as { token: string; password: string };
	try {
		await auth.resetPassword.confirm(token, password);
		return new Response(null, { status: 204 });
	} catch (error) {
		if (!(error instanceof JanusError)) throw error;
		switch (error.code) {
			case 'TOKEN_UNKNOWN':
			case 'TOKEN_SPENT':
			case 'TOKEN_EXPIRED':
			case 'TOKEN_STALE':
				return Response.json({ error: 'link' }, { status: 400 });
			case 'PASSWORD_TOO_SHORT':
				return Response.json({ minLength: error.minLength }, { status: 400 });
			default:
				throw error; // STORE_FAILED: your 503
		}
	}
}
```

## Requests that send e-mail are throttled

**Every request that hands out something to e-mail is counted**, on by default:
five per 10 minutes, per flow. Past the limit the request throws
`MailThrottledError` (`MAIL_THROTTLED`, 429) with `retryAfter` — the whole
seconds to the end of the window, at least 1 — and **a refused request spends,
invalidates and rotates nothing**: no token, code or challenge is minted, and
nothing earlier is spent, so **the last link or code sent still confirms until
it expires**, whoever asked for it. The count comes before anything is issued,
and the earlier tokens are spent only after a new one is issued.

```ts
import { MailThrottledError } from '@nxgt/janus';

try {
	await auth.resetPassword.request(email);
} catch (error) {
	if (error instanceof MailThrottledError) {
		// 429 and Retry-After: error.retryAfter — safe to show, it reveals nothing about accounts.
		// Tell the visitor: "Check your inbox: the last e-mail we sent still works.
		// You can ask for a new one in N minutes."
	}
	throw error;
}
```

| Flow | Counted per | Why |
| --- | --- | --- |
| `magicLink.request(email)` | address | Anybody can call it with any address. Counted before the address is looked up, so an address nobody holds is refused like a registered one |
| `signInCode.request(email)` | address | The same |
| `resetPassword.request(email)` | address | The same |
| `verifyEmail.send(user)` | user | The application calls it for a user it knows: an unauthenticated loop on the address cannot spend this count, so it never blocks the user's own verification, and a user changing e-mail buys no extra sends |
| `stepUp.request(user)`, when it e-mails a code (`via: 'email'`) | user | The same. A step-up confirmed with the app (`via: 'secondFactor'`) sends nothing and is not counted |

**Keep the window no longer than the shortest token lifetime you set.** A
refused request spends nothing, but the last link or code sent still has to be
alive. With `tokens.signInCode: '5m'` and the 10-minute window, a code can lapse
while the visitor is still refused. `janus()` warns for it, once per call, with
`process.emitWarning` and the code `JANUS_THROTTLE_WINDOW`, naming each flow
whose lifetime is shorter than the window:

```
janus: tokens.signInCode is 5m, shorter than mail.throttle.window, 10m — past the limit the last token sent can expire before the refusal ends. Set mail.throttle.window to 5m or less, or raise tokens.signInCode to 10m or more.
```

Shorten `mail.throttle.window`, or raise the lifetime. Nothing is refused, so
a window you chose on purpose only costs the warning.

**`prepare` counts as `request` does**, in the same window: see
[requests in two steps](#requests-in-two-steps), for an application that
sends the e-mail off the visitor's request and still wants to tell them
they are throttled.

**Each flow counts on its own**: a loop on `magicLink.request` never shuts
`signInCode.request`. The address is normalised (trimmed, lowercased) and is
the same count whatever the user type.

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `mail.throttle.attempts` | whole number above zero | `5` | Requests per flow, per address or user, per window |
| `mail.throttle.window` | `Duration` | `'10m'` | How long a window lasts |
| `mail.throttle` | `false` | | Counts nothing: limit those requests yourself |

```ts
janus({ user, store, mail: { throttle: { attempts: 3, window: '1h' } } });
janus({ user, store, mail: { throttle: false } });
```

```ts
export interface MailConfig {
	readonly throttle?: MailThrottleConfig | false;
}
export interface MailThrottleConfig {
	readonly attempts?: number;
	readonly window?: Duration;
}
```

Five per ten minutes is no longer than the shortest default token lifetime
(`signInCode` and `stepUp` `'10m'`; `magicLink` `'15m'`, `resetPassword` `'1h'`,
`verifyEmail` `'24h'`), so under the defaults the last link or code sent —
issued inside the window — is still live for the whole refusal. It leaves room
for a visitor who asks again, and holds a loop to thirty e-mails an hour per
flow and address. A wrong value is refused when `janus()` is called, with
a `TypeError`: `janus: mail must be an object — { throttle }`, `janus:
mail.throttle must be { attempts, window }, or false to count nothing`,
`janus: mail.throttle.attempts must be a whole number above zero`, or a
`janus: mail.throttle.window` duration message.

**Fixed windows, and nothing locks.** The window is a fixed slice of the
clock, as the sign-in throttle's. Requests at once are counted in one store
write each: of twenty at once, exactly five are issued. The next window
answers again. A refused request is counted too but cannot extend the wait.

**Where the counts live.** In the tokens store, as `secondFactor` tokens named
by a keyed hash of the flow and the address or user id: no port change, no new
infrastructure, and never the address. That is one row per flow per address or
user per window. On PostgreSQL, `collectExpired()` does not collect lapsed
ones: schedule the delete, as for the sign-in throttle. A flushed or evicting
Redis forgets the counts, and a tokens store that cannot count throws
`STORE_FAILED` with nothing issued: it fails closed.

**What it does not do.**

- **It cannot lock somebody out.** Somebody who asks for an address in a loop
  can fill its inbox with at most five e-mails per window per flow, but the
  last e-mail they caused to be sent was a real e-mail to the real owner and
  still works until it expires. The password sign-in is untouched.
- **A lifetime shorter than the window breaks that.** With
  `tokens.signInCode: '5m'` and the default window, the last code can expire
  before the window ends and the visitor has no live code until it does. Keep
  `mail.throttle.window` no longer than the shortest of the `tokens.*`
  lifetimes you use.
- **It is not per client.** `janus` never sees IP addresses, so one client
  asking for many addresses is not counted. Add a per-IP ceiling in front of
  the routes: `@nxgt/redis` (0.5.0 and later) has rate limits for it.

```ts
import { bindRateLimit, defineRateLimit, GuardError } from '@nxgt/redis';

export const mailRequests = defineRateLimit({
	name: 'mail-requests',
	key: (p: { ip: string }) => p.ip,
	limit: 20,
	per: 3_600_000,
});
const perIp = bindRateLimit(client, mailRequests); // or redis.limits.<name> when wired

try {
	await perIp.enforce({ ip }); // before auth.magicLink.request(email)
} catch (error) {
	if (error instanceof GuardError && error.code === 'RATE_LIMITED') {
		// error.retryAfter is in MILLISECONDS: Math.ceil(error.retryAfter / 1000) for Retry-After
	}
	throw error;
}
```
- **A test suite** that requests more than five of one flow for one address or
  user over a `fixedClock` is throttled: advance the clock past `retryAfter`,
  or wire `mail: { throttle: false }`.

**Not throttled**, because they follow a write or a sign-in, which are bounded
elsewhere (the [sign-in throttle](passwords.md#password-guessing-is-throttled)
bounds sign-ins), not a request to mail an address:

- `update` changing the e-mail: an application write. Its notice to the former
  address is sent from the `user.emailChanged` event.
- The notices sent from [events](events.md): a new device, a password changed,
  a recovery code used, and the like.

`@nxgt/janus-hono` and `@nxgt/janus-graphql` answer `MAIL_THROTTLED` with 429,
`retryAfter` in the body (or the extensions) and a `Retry-After` header;
`@nxgt/janus-telemetry` writes a `janus.mail.throttled` warning with
`janus.mail.flow` and `janus.mail.retryAfter`, never the address.

## Requests in two steps

`request(email)` counts the address, then looks it up and issues. Its time
tells what its answer does not: an address with an account costs a lookup,
a token written and the earlier ones spent; one nobody holds stops at the
lookup. So an application that must not tell the two apart runs `request`
**off the visitor's request** — and there, a `MAIL_THROTTLED` reaches
nobody: the visitor is never told to use the last e-mail they received.

`prepare(email)` cuts `request` in two at the count, on the three flows
counted per address:

| Call | Does | Answers |
| --- | --- | --- |
| `magicLink.prepare(email)` | validates, counts the address, looks nobody up | `PreparedRequest<IssuedToken & { user }>`: `{ send() }` |
| `signInCode.prepare(email)` | the same, and mints the challenge | `PreparedCode<User>`: `{ challenge, send() }` |
| `resetPassword.prepare(email)` | the same, refusing a type with no password as `request` does | `PreparedRequest<IssuedToken & { user }>`: `{ send() }` |
| `send()`, on any of them | the rest of `request` — the lookup, the token issued, the earlier ones spent — **once**, and counts nothing | what `request` answers: the token or code, or `null` for nobody |

Call `prepare` in the visitor's request, where its `MailThrottledError` can be
answered; call `send()` off it:

```ts
import { Hono } from 'hono';
import { janusErrors } from '@nxgt/janus-hono';

const app = new Hono();
app.onError(janusErrors()); // MAIL_THROTTLED → 429, Retry-After and retryAfter in the body

app.post('/reset-password', async (c) => {
	const { email } = await c.req.json();
	const pending = await auth.resetPassword.prepare(email); // counted: throws MAIL_THROTTLED past the limit
	void mailOff(async () => {
		const issued = await pending.send(); // looked up and issued, off the visitor's request
		if (issued !== null) {
			await mailer.send(issued.email, `https://app.example/reset?token=${issued.token}`);
		}
	});
	return c.body(null, 202); // the same answer either way
});

/** Runs `work` off the request, and reports what it throws: nobody else will see it. */
function mailOff(work: () => Promise<void>): Promise<void> {
	return work().catch((error: unknown) => console.error(error));
}
```

The visitor sees `429` with `retryAfter` past the limit — "use the last
e-mail you received, or wait" — and `202` otherwise, in the same time whether
the address has an account or not. In production, `send()` belongs in the
queue that sends the e-mail, so a failure is retried by preparing again.

**What `prepare` does is the same for every address.** It looks nobody up:
the store calls are the count's, the same calls whoever holds the address,
and none at all with `mail: { throttle: false }`, where `prepare` still
validates and answers a pending request. `prepare` and `request` share one
count: three `prepare` and two `request` of one flow for one address fill
the window.

**`send()` runs once.** The count `prepare` made pays for one issue, and
nothing a caller passes can skip it — there is no option to say "already
counted". A second `send()` is a `TypeError`:

```
magicLink.prepare(…).send: already called — a prepared request sends once; call magicLink.prepare again for another
```

A `send()` that failed — `STORE_FAILED` — is spent too: prepare again, which
counts again. Two `send()` at once issue one token; the other is the
`TypeError`.

**A sign-in code's challenge comes with `prepare`.** The visitor keeps the
challenge, and the code goes to the inbox, so a code requested in the
background still needs its challenge in the foreground answer.
`signInCode.prepare` mints it before the lookup, so it is in the visitor's
cookie whoever holds the address — the decoy an unknown address needed is
no longer yours to make. For an address nobody holds, `send()` answers
`null` and the challenge is `TOKEN_UNKNOWN`; otherwise the code `send()`
issues is checked against it. See
[the sign-in code guide](sign-in-code.md#requesting-a-code-in-two-steps).

**`verifyEmail.send` and `stepUp.request` have no `prepare`.** They are
counted per user, and called for a user the application already holds — the
session's, or one it just created — so their time tells nothing about who
has an account, and their `MAIL_THROTTLED` already reaches the visitor in
the request that asked.

**`@nxgt/janus-telemetry`** traces `prepare` as
`janus.magicLink.prepare` and its `send()` as `janus.magicLink.prepare.send`;
`janus.mail.throttled` names `janus.mail.flow: magicLink.prepare`, and
`janus.magicLink.sent` and `janus.signInCode.sent` are written by `send()`,
as by `request`.

## What a token refusal means

| Code | When |
| --- | --- |
| `TOKEN_UNKNOWN` | No token holds that secret — or it was issued for the other flow: a verification token is not a reset token |
| `TOKEN_SPENT` | Already redeemed — every token is single use. A reset link is also spent by a newer `request` for the same user, and by any password written since it was sent |
| `TOKEN_EXPIRED` | Its lifespan passed. It is spent all the same, so it cannot be retried |
| `TOKEN_STALE` | Sent to an e-mail the user no longer has |

Of twenty concurrent redemptions of one token, exactly one succeeds: the store
spends it in one conditional write. The store holds the token's `sha256`,
never the token, and no refusal's message contains it.

## See also

- [Users](users.md) — `email`, `update`, and the other per-type methods
- [Sign-in codes](sign-in-code.md) — the third flow that sends an e-mail: a code, not a link
- [Sign-in links](magic-link.md) — the fourth: a link that signs in, confirmed from a `POST` so a mail scanner spends nothing
- [Sessions](sessions.md) — `signOutEverywhere`, which `resetPassword.confirm` calls for you
- [User events](events.md) — `user.emailVerified` and `user.passwordReset`, which the confirms send
- [Errors](errors.md) — every code, and the status it deserves
