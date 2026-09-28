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

Every attempt is counted before anything is compared — a guess that fails
for any reason has cost one — as for a sign-in code. An app's codes are also
counted **per user**, five per 15-minute window, in the same count as
`regenerateRecoveryCodes`: a stolen session asking for challenge after
challenge still gets five guesses per window, not five per challenge. The
app's code accepted is spent, as at a sign-in: it confirms nothing else.

**Rate-limit `request` per user.** An e-mailed code has no such window:
five guesses per challenge, and a new challenge takes only a new `request`.
A stolen session could ask again and again — each request also sends an
e-mail and cancels the code before it. Limit `stepUp.request` per user —
a few an hour is plenty for a person — as you limit `signInCode.request`
per address; the `janus.stepUp.asked` event of `@nxgt/janus-telemetry` is
the signal to alert on.

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
