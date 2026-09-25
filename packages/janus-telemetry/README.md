# @nxgt/janus-telemetry

[`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) on
[`@nxgt/telemetry`](https://www.npmjs.com/package/@nxgt/telemetry): a span per
flow and per permission check, and the security events an audit reads — who
signed up, in and out, why a sign-in was refused, which users were deleted or
deactivated, whose password changed, and who was granted what. **Never a
login, an e-mail, a password, a token or a session id.**

```ts
import { janus } from '@nxgt/janus';
import { permissions } from '@nxgt/janus/permissions';
import { instrumentJanus, instrumentPermissions } from '@nxgt/janus-telemetry';

export const auth = instrumentJanus(janus({ users, hasher, ...mongo }));
export const access = instrumentPermissions(permissions({ model, store: mongo.relations }));
```

The instances answer exactly as before, with the same types; everything they
do now shows up in the telemetry you installed —
`createTelemetry(…).install()`, or `@nxgt/telemetry-hono`'s server span, which
the flows' spans nest under.

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-telemetry @nxgt/janus @nxgt/telemetry
```

Every peer is required: `@nxgt/janus`, `@nxgt/telemetry` (0.2.1 or later) and
`typescript` (6). Both are **peers**: one copy of `@nxgt/janus`, so
`instanceof StoreFailure` holds, and one of `@nxgt/telemetry`, so there is one
current span. Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`.

## API

| Export | What it is |
| --- | --- |
| `instrumentJanus(auth)` | The same `janus()` instance, frozen, with every flow traced — `janus.signIn`, or `janus.patient.signIn` with several user types — and the security events written as logs. `cookie` stays synchronous and untraced |
| `instrumentPermissions(access)` | The same `permissions()` instance, frozen, with `can`, `list`, `grant` and `revoke` traced, and one audit event per tuple written |

## What is written

### Spans

| Span | Attributes |
| --- | --- |
| `janus.<flow>`, `janus.<type>.<flow>` | `janus.user.type`; `user.id` once the answer names a user; `janus.session.renewed` for `authenticate` |
| `janus.can` | `janus.subject.type`, `janus.subject.id`, `janus.permission`, `janus.object.type`, `janus.object.id`, and the answer, `janus.allowed` |
| `janus.list` | the subject, `janus.permission`, `janus.object.type`, and `janus.page.items`, how many it found |
| `janus.grant`, `janus.revoke` | the object, `janus.relation`, and the subject — `janus.subject.relation` for a subject set |

**A refusal is an answer, not a failure.** A wrong password, a taken login, a
spent token, a denial: the span is `ok`, and a refusal carries
`janus.refusal`, its code. A failure — `STORE_FAILED`, `UNSUPPORTED`,
`PERMISSION_DEPTH`, `HASH_UNSUPPORTED`, or anything that is not a `JanusError`
— fails the span, with `janus.error.code`, and `janus.store.slot` and
`janus.store.operation` naming the store that could not answer.

### Events

Logs from the source `@nxgt/janus`, each with `janus.user.type` and `user.id`
when they are known:

| Event | Severity | When |
| --- | --- | --- |
| `janus.signUp` | info | a user signed up |
| `janus.signIn` | info | a user signed in |
| `janus.signIn.refused` | **warn** | a sign-in was refused, with `janus.refusal` and `janus.refusal.reason` — `unknownLogin`, `noPassword`, `wrongPassword` |
| `janus.signOut` | info | a session was signed out |
| `janus.signOutEverywhere` | info | every session of a user was revoked |
| `janus.user.deleted` | info | a user was deleted |
| `janus.user.activated`, `janus.user.deactivated` | info | `setActive` |
| `janus.password.changed`, `janus.password.set`, `janus.password.reset` | info | the user's change, an admin's, a reset |
| `janus.email.verified` | info | an e-mail was confirmed |
| `janus.tuple.granted`, `janus.tuple.revoked` | info | a tuple was written, with the object, relation and subject |

## Traps

- **Instrument the instance you hand out.** Wrap `janus()` and
  `permissions()` where they are created, and export the wrapped ones: a
  route given the unwrapped instance is not traced.
- **The instances are copies, frozen.** `instrumentJanus(auth) !== auth`, and
  nothing can be added to it. Everything `janus()` answered is there.
- **Nothing is written without a telemetry.** With none installed, the spans
  and events go nowhere, as `@nxgt/telemetry` does everywhere: the flows still
  answer.
- **A refused sign-in by an unknown login names no user.** `janus.signIn.refused`
  carries the reason and the user type, never the login that was tried: rate
  limiting per login is the application's, from the error itself.

## Documentation

- [Tracing Janus](docs/guide/tracing.md) — wiring it with a Hono app, reading the spans and events, the audit trail
- [Troubleshooting](docs/troubleshooting.md) — what you see, why, and the fix
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned

## Licence

MIT
