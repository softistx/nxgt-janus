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
janus.tuple.granted   janus.object.type=record  janus.object.id=r1  janus.relation=owner  janus.subject.type=patient  janus.subject.id=u1
```

## What is never written

A login, an e-mail, a password, a token, a session id — nothing a log reader
could sign in with, or use to tell who holds an account. A refused sign-in by
an unknown login says `janus.refusal.reason: 'unknownLogin'`, not which login
was tried; only `USER_INACTIVE` names the user, whose password was right.
The spec that holds this runs every flow and searches every signal
for each of them.

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
