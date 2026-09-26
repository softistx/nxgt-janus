# Tracing Janus

This page is for making what `@nxgt/janus` does visible — its flows as spans,
its security events as logs — in an application that already installs
`@nxgt/telemetry`.

## Wiring

Wrap the instances where they are created, and export only the wrapped ones:

```ts
// auth.ts
import { janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { createMongoAdapter } from '@nxgt/janus-mongo';
import { instrumentJanus, instrumentPermissions } from '@nxgt/janus-telemetry';

const mongo = createMongoAdapter(db);

export const auth = instrumentJanus(
	janus({ users, hasher: scryptHasher(), ...mongo }),
);

export const access = instrumentPermissions(
	permissions({ model: defineModel({ subjects: auth.types, types }), store: mongo.relations }),
);
```

`auth.types` reads the same through the wrapper, so the model is defined from
the wrapped instance as from the plain one.

With Hono, `@nxgt/telemetry-hono` opens a server span per request, and every
flow a route calls nests under it:

```ts
import { telemetry } from '@nxgt/telemetry-hono';
import { bindJanus } from '@nxgt/janus-hono';

const j = bindJanus({ auth, access });

const app = new Hono()
	.use(telemetry({ service: 'clinic' }), j.session(), j.provide())
	.get('/records/:id', j.permission('view', 'record', recordOf), (c) => c.json(c.var.object));
```

A request to `/records/r1` is then one trace:

```
GET /records/:id                         server
├─ janus.authenticate                    user.id, janus.user.type, janus.session.renewed
└─ janus.can                             janus.permission=view, janus.object.id=r1, janus.allowed=true
```

## Refusals and failures

A span answers one question: **did Janus work?** A wrong password is Janus
working — it answered a refusal — so the span is `ok` and carries
`janus.refusal: 'CREDENTIALS_INVALID'`. A store that cannot answer is Janus
failing, so the span is `error`, with the store named:

```
janus.patient.signIn   error   janus.error.code=STORE_FAILED  janus.store.slot=users  janus.store.operation=findUserByLogin
```

The failures are `STORE_FAILED`, `UNSUPPORTED`, `PERMISSION_DEPTH`,
`HASH_UNSUPPORTED`, and anything thrown that is not a `JanusError`. Every other
code is a refusal. An alert on failed `janus.*` spans therefore fires on an
outage, never on users mistyping their password.

## The audit trail

The events are logs, from the source `@nxgt/janus`, written inside the flow's
span — so each carries its `traceId`, and the request that caused it is one
query away. Refused sign-ins are **warnings**; everything else is info:

```ts
// Every refused sign-in of the last hour, in a collector that stores logs:
// name = 'janus.signIn.refused' AND at > now() - 1h, grouped by janus.refusal.reason
```

`janus.tuple.granted` and `janus.tuple.revoked` are the record of who was
given what:

```
janus.tuple.granted   janus.object.type=record  janus.object.id=r1  janus.relation=owners  janus.subject.type=patient  janus.subject.id=u1
```

## A second factor

With `janus({ secondFactor })`, a sign-in with a code is two calls, and so
two spans and two events. The `signIn` span says which answer it gave, in
`janus.signIn.status`:

```
POST /sign-in                            server
└─ janus.signIn                          janus.user.type=user  janus.signIn.status=secondFactor
     log  janus.signIn.secondFactor      janus.user.type=user

POST /sign-in/code                       server
└─ janus.secondFactor.confirm            janus.user.type=user  user.id=0199…
     log  janus.signIn                   user.id=0199…  janus.signIn.secondFactor=true
```

The first event carries the user type alone: a challenge names no user, and
the log would otherwise need the login to say whose it is. The `janus.signIn`
written by `confirm` names the user, and `janus.signIn.secondFactor: true`
tells it from a sign-in by password alone.

A wrong code is a refusal, so the span stays `ok`, and a warning names the
user and what the challenge has left:

```
janus.signIn.refused   janus.refusal=CODE_INVALID  janus.secondFactor.attemptsLeft=3  user.id=0199…
```

At `0` the challenge is spent. A user whose count reaches `0` challenge after
challenge is someone who has their password and not their phone — the
signal worth an alert:

```ts
// name = 'janus.signIn.refused' AND janus.refusal = 'CODE_INVALID'
//   AND janus.secondFactor.attemptsLeft = 0, grouped by user.id
```

A lapsed, spent or unknown challenge is a `janus.signIn.refused` with its
`TOKEN_*` code and no `user.id`: it is refused before the user is read.

`enroll`, `activate` and `disable` each write one event once they answered,
with the `user.id` they were called for — `janus.secondFactor.enrolled`,
`janus.secondFactor.activated`, `janus.secondFactor.disabled`. A refused one
(`SECOND_FACTOR_ACTIVE`, a wrong first code) writes no event: its span
carries `janus.refusal`, like any refusal.

## A code sent by e-mail

A sign-in by e-mailed code is two calls too — `signInCode.request`, then
`signInCode.confirm` — and each writes one event:

```
POST /sign-in/email                      server
└─ janus.signInCode.request              janus.user.type=user  user.id=0199…
     log  janus.signInCode.sent          janus.user.type=user  user.id=0199…

POST /sign-in/email/code                 server
└─ janus.signInCode.confirm              janus.user.type=user  user.id=0199…  janus.signIn.status=signedIn
     log  janus.signIn                   user.id=0199…  janus.signIn.code=true
```

`janus.signInCode.sent` is written only when a code was issued. A request
for an address nobody holds — or an inactive user's — answers `null`, and
its span carries `janus.user.type` alone, with no event: the address that
was typed is never written, so the trail cannot be read back as a list of
who has an account. `janus.signIn.code: true` tells a sign-in by code from
one by password.

The `confirm` span carries `janus.signIn.status`, as `signIn`'s does. For a
user whose second factor is active, the code opens no session: the status
is `secondFactor`, the event is `janus.signIn.secondFactor`, and the
`janus.signIn` comes from the `secondFactor.confirm` that follows, with
`janus.signIn.secondFactor: true` and no `janus.signIn.code`:

```
POST /sign-in/email/code                 server
└─ janus.signInCode.confirm              janus.user.type=user  janus.signIn.status=secondFactor
     log  janus.signIn.secondFactor      janus.user.type=user
```

A refused code is the same warning as a second factor's — the attribute
keeps its name, `janus.secondFactor.attemptsLeft`, for both — marked with
`janus.signIn.code: true` so an alert can tell the two apart:

```
janus.signIn.refused   janus.refusal=CODE_INVALID  janus.secondFactor.attemptsLeft=4  janus.signIn.code=true  user.id=0199…
```

A lapsed, spent or unknown challenge is a `janus.signIn.refused` with its
`TOKEN_*` code and no `user.id`; `TOKEN_STALE` — the e-mail changed since
the code was sent — and `USER_INACTIVE` name the user. **Every** refusal of
`signInCode.confirm` carries `janus.signIn.code: true`, not only
`CODE_INVALID`: the `TOKEN_*` codes, `TOKEN_STALE`, `USER_INACTIVE` and
`VERSION_CONFLICT` too. A filter on the mark sees every refused e-mailed
code, and nothing of the second factor:

```
janus.signIn.refused   janus.refusal=TOKEN_EXPIRED  janus.signIn.code=true
```

Two signals worth an alert: a user whose codes run out of attempts, as for a
second factor, and a user sent codes again and again — someone filling an
inbox, or trying their luck with a challenge at a time:

```ts
// name = 'janus.signInCode.sent', grouped by user.id, more than 10 in an hour
```

## What is never written

A login, an e-mail, a password, a session token, a one-time token, a
challenge — a second factor's or a sign-in code's — a code, a TOTP secret,
the `otpauth://` URI that holds it, a session id: nothing a log reader could
sign in with, or use to tell who holds an account. A refused sign-in by
an unknown login says `janus.refusal.reason: 'unknownLogin'`, not which login
was tried; only a refusal after the password was right, or against a
challenge — `USER_INACTIVE`, `CODE_INVALID`, `TOKEN_STALE` or
`SECOND_FACTOR_NOT_ENROLLED` — names the user. The specs that hold this run
every flow — `enroll`, `activate`, a sign-in code requested for nobody and
for a user, a refused and an accepted `confirm` among them — and search
every signal for each code, challenge and session token they handled.

## In a test

Give the test a telemetry of its own, as `@nxgt/telemetry` recommends, and read
what it received:

```ts
import { createTelemetry, type Signal, withTelemetry } from '@nxgt/telemetry';

const received: Signal[] = [];
const telemetry = createTelemetry('test', {
	exporters: [{ export: (_resource, batch) => void received.push(...batch) }],
});
await withTelemetry(telemetry, () => auth.patient.signIn({ email, password }));
await telemetry.close(); // flushes
received.find((signal) => signal.name === 'janus.signIn'); // the event
```

## See also

- [`@nxgt/telemetry`](https://www.npmjs.com/package/@nxgt/telemetry) — installing a telemetry, exporters, sampling
- [`@nxgt/janus-hono`](https://www.npmjs.com/package/@nxgt/janus-hono) — the routes these flows run in
