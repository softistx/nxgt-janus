# Confirming a sensitive action — the step-up

This page is for asking a signed-in user to prove again who they are before
something a stolen session should not do alone: changing the e-mail,
disabling the second factor, deleting the account. `janus` issues and checks
a code, and **stamps the session as freshly confirmed**; sending the e-mail
is yours, and so is deciding which routes ask.

```ts
import { assertFresh, createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

// The route that deletes the account asks for a recent proof:
const current = await auth.authenticate(request);
if (current === null) return new Response(null, { status: 401 });
assertFresh(current.session, '10m'); // STEP_UP_REQUIRED (403) past ten minutes

// The client, told STEP_UP_REQUIRED, asks for a step-up…
const issued = await auth.stepUp.request(current.user);
await sendMail(issued.email, 'Confirm it is you', `${issued.code} confirms the action. It expires in 10 minutes.`);
// …keeps issued.challenge, and sends it back with the code the user typed:
const session = await auth.stepUp.confirm(request, issued.challenge, code);
session.authenticatedAt; // now: the action goes through for the next ten minutes
```

`sendMail` stands for your own sending. With
[`@nxgt/janus-mail`](https://www.npmjs.com/package/@nxgt/janus-mail) 0.8,
`mail.stepUp(issued, { name, locale })` sends it — "Your confirmation code",
in English or French — see [Sending the code with
`@nxgt/janus-mail`](#sending-the-code-with-nxgtjanus-mail).

A step-up is two requests, as a sign-in by code is: one issues the code, the
other takes it and stamps the session. It **opens no session** and hands out
no new token: the session the request presents is the one confirmed, which
is why `confirm` takes the request.

## What "fresh" means

`session.authenticatedAt` is when the session last proved who it is: at the
sign-in, and since then at every `stepUp.confirm` on it. Renewing a sliding
session does not move it. So a session signed in five minutes ago is fresh
already — the user just gave their password — and one signed in days ago
is fresh again once a step-up confirms it.

`assertFresh(session, maxAge, clock?)` is that check, and reads nothing
else: no store, no request. It throws `StepUpRequiredError`, code
`STEP_UP_REQUIRED`, which `statusOf` answers 403, when the session proved
who it is `maxAge` ago or more. Pass the `clock` you gave `janus()` when it
is not the system's — `fixedClock` in a spec. A `maxAge` that is not a
[duration](vocabulary.md) is a `TypeError`: it is written in the code.

```ts
import { StepUpRequiredError } from '@nxgt/janus';

try {
	assertFresh(current.session, '5m');
} catch (error) {
	if (error instanceof StepUpRequiredError) {
		return Response.json({ code: error.code }, { status: 403 });
	}
	throw error;
}
```

## Which types have it

`stepUp` exists on every user type with an e-mail, as `signInCode` does. A
type with no e-mail has no `stepUp`: it is absent from its type.

```ts
const clinic = janus({
	users: {
		patient: { schema: Patient, password: { login: 'email' } },   // has stepUp
		staff: { schema: Staff, password: { login: 'username' } },    // no e-mail field
	},
	store,
	hasher,
});

// @ts-expect-error — staff have no e-mail to send a code to
clinic.staff.stepUp;
```

## Requesting a step-up

```ts
const issued = await auth.stepUp.request(user); // a user, or its id
```

What it answers depends on the user:

| The user | `issued.via` | What to do |
| --- | --- | --- |
| no active second factor | `'email'` | send `issued.code` to `issued.email`, keep `issued.challenge` |
| an active second factor | `'secondFactor'` | send nothing: ask for the code their app shows, keep `issued.challenge` |

A user whose factor is active **confirms with their app, never by e-mail**:
a step-up is never weaker than the sign-in their account asks for, so
somebody who reads the user's inbox cannot disable the factor with a stolen
session. Without `secondFactor` in `janus()`'s configuration, and on a type
with no password, `via` is always `'email'`, and the type says so: `issued.code`
is there without narrowing.

```ts
const issued = await auth.stepUp.request(current.user);
if (issued.via === 'email') {
	await sendMail(issued.email, 'Confirm it is you', issued.code);
}
return Response.json({ challenge: issued.challenge, via: issued.via });
```

### Sending the code with `@nxgt/janus-mail`

`@nxgt/janus-mail`'s `mail.stepUp` takes what `request` answered, once
narrowed to `via: 'email'`, and sends it to `issued.email`: a greeting by
name, the code, how long it lasts — "This code expires in 10 minutes." —
and a **Secure my account** button to its `links.secureAccount()`, for a
user who asked for nothing. It reads the code, the address and `expiresAt`,
never the challenge:

```ts
import { janusMail } from '@nxgt/janus-mail';

const mail = janusMail({ mailer, from: 'noreply@acme.example', brand: 'Acme', links });

const issued = await auth.stepUp.request(current.user);
if (issued.via === 'email') {
	await mail.stepUp(issued, { name: current.user.name, locale: current.user.locale });
}
return Response.json({ challenge: issued.challenge, via: issued.via });
```

An un-narrowed answer is a compile error there, and a `via: 'secondFactor'`
passed from JavaScript a `TypeError`: an app's step-up has nothing to send.
See its [sending guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-mail/docs/guide/sending.md#stepupissued-to-options).

**One step-up is live per user**: a request spends every step-up issued
before it. The challenge lapses after ten minutes by default —
`janus({ tokens: { stepUp: '5m' } })` changes it.

`request` refuses a user of no such id, or one with no e-mail, with
`NOT_FOUND`, and an inactive one with `USER_INACTIVE`. It is meant for the
user of the session: call it with `current.user`, never with an id a client
sent.

## Confirming

```ts
const session = await auth.stepUp.confirm(request, challenge, code);
```

`confirm` checks the code, then moves `authenticatedAt` of **the session the
request presents** to now — read from the request as `authenticate` reads
it: `Authorization: Bearer`, `X-Session-Token`, then the cookie. It answers
that session. The session must be a standing one of the user the challenge
is for: a request with no session, a revoked or lapsed one, or another
user's is refused as `TOKEN_UNKNOWN`, as a challenge nobody issued is.

| Code | When |
| --- | --- |
| `CODE_INVALID`, with `attemptsLeft` | the code does not match; the fifth wrong one spends the challenge |
| `TOKEN_UNKNOWN` | no such challenge, a sign-in code's challenge, or a request whose session is not a standing one of the challenge's user — or was revoked while the code was checked |
| `TOKEN_SPENT`, `TOKEN_EXPIRED` | the challenge was used, replaced by a later request, or lapsed |
| `TOKEN_STALE` | an e-mailed code, and the user changed their e-mail since |
| `SECOND_FACTOR_ACTIVE` | an e-mailed code, and the user activated a second factor since: request again, the app confirms now |
| `SECOND_FACTOR_NOT_ENROLLED` | an app's challenge, and the factor was disabled since |
| `USER_INACTIVE` | the user was deactivated |
| `VERSION_CONFLICT` | an app's code sent twice at once: the other confirmation stamped the session |

Every attempt is counted before anything is compared — a guess that fails
for any reason has cost one — as for a sign-in code. An app's codes are also
counted **per user**, five per 15-minute window, in the same count as
`regenerateRecoveryCodes`: a stolen session asking for challenge after
challenge still gets five guesses per window, not five per challenge. The
app's code accepted is spent, as at a sign-in: it confirms nothing else.

**`request` is throttled per user, when it e-mails.** An e-mailed code has no
such window: five guesses per challenge, and a new challenge takes only a new
`request`. A stolen session could ask again and again — each request also
sends an e-mail and cancels the code before it. So `stepUp.request` counts
the user, five per 15-minute window (`mail: { throttle }`), and past it throws
`MailThrottledError` (`MAIL_THROTTLED`, with `userId`) and issues nothing.
It counts **only** `via: 'email'`: a step-up confirmed with the app
(`via: 'secondFactor'`) sends nothing and is not counted.

It is per user rather than per address because the application calls it for a
user it knows: nobody without their session can spend the count, so an
unauthenticated loop on their address never blocks their own step-up, and a
user who changes e-mail buys no extra sends. Answer it with a 429 and
`Retry-After`:

```ts
import { MailThrottledError } from '@nxgt/janus';

try {
	const issued = await auth.stepUp.request(current.user);
	// …send the e-mail from `issued`, whether or not there is one to send
} catch (error) {
	if (error instanceof MailThrottledError) {
		return Response.json(
			{ error: 'too many e-mails', retryAfter: error.retryAfter },
			{ status: 429, headers: { 'retry-after': String(error.retryAfter) } },
		);
	}
	throw error;
}
```

The `janus.stepUp.asked` event of `@nxgt/janus-telemetry` is the signal to
alert on; it also writes a `janus.mail.throttled` warning when the throttle
refuses. See [the mail throttle](email-flows.md#requests-that-send-e-mail-are-throttled).

A step-up and a sign-in code are **two kinds of token**: a sign-in code's
challenge confirms no action, and a step-up's code signs nobody in.

## Nothing else is written

`stepUp.confirm` writes the session's `authenticatedAt` and, for an app's
code, the step the factor accepted. It sends no user event — nothing about
the user changed — and opens no session. With `@nxgt/janus-telemetry`, both
calls are traced like every other flow.

## See also

- [Sessions](sessions.md) — `authenticate`, and what a session holds.
- [The second factor](second-factor.md) — the app's codes, and asking
  before `disable`.
- [Signing in with an e-mailed code](sign-in-code.md) — the same six digits,
  to sign in.
- [Errors](errors.md) — every code and its status.
- [`@nxgt/janus-mail`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-mail/docs/guide/sending.md#stepupissued-to-options)
  — `mail.stepUp`, the step-up's e-mail.
