# @nxgt/janus-telemetry

[`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) on
[`@nxgt/telemetry`](https://www.npmjs.com/package/@nxgt/telemetry): a span per
flow and per permission check, and the security events an audit reads — who
signed up, in and out, who was sent a sign-in code, why a sign-in was
refused, who was asked for a second factor and who enrolled, activated or
disabled one, which users were deleted
or deactivated, whose password changed, and who was granted what. **Never a
login, an e-mail, a password, a session token, a one-time token, a
challenge, a code, a TOTP secret or a session id.**

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
bun add -d typescript
```

Every peer is required: `@nxgt/janus` 0.9 (the exact range is in
`peerDependencies`), `@nxgt/telemetry` (`>=0.2.1 <1`, any 0.x from 0.2.1) and
`typescript` (6). `@nxgt/janus` and `@nxgt/telemetry` are **peers**: one copy of `@nxgt/janus`, so
`instanceof JanusError` holds, and one of `@nxgt/telemetry`, so there is one
current span. Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`.

## API

| Export | What it is |
| --- | --- |
| `instrumentJanus(auth)` | The same `janus()` instance, frozen, with every flow traced under its call path — `auth.signIn` as `janus.signIn`, `auth.patient.signIn` as `janus.patient.signIn` — and the security events written as logs. `cookie` stays synchronous and untraced |
| `instrumentPermissions(access)` | The same `permissions()` instance, frozen, with `can`, `list`, `grant` and `revoke` traced, and one audit event per tuple written |
| `JanusLike`, `PermissionsLike` | What each accepts: `instrumentJanus(access)` and `instrumentPermissions(auth)` do not compile. `PermissionsLike.model.subjects`, which `permissions()` answers, tells a user from a subject set; an instance without it has every `{ type, id, relation }` recorded as a set |

## What is written

### Spans

| Span | Attributes |
| --- | --- |
| `janus.<flow>`, `janus.<type>.<flow>` — `janus.secondFactor.confirm` and `janus.signInCode.confirm` included | `janus.user.type`; `user.id` once the answer names a user; `janus.session.renewed` for `authenticate`; `janus.signIn.status` for `signIn` and `signInCode.confirm` — `signedIn`, or `secondFactor` when it answered a challenge; for `stepUp.confirm`, the `user.id` of the session it stamped, never the session's id |
| `janus.can` | `janus.subject.type`, `janus.subject.id`, `janus.permission`, `janus.object.type`, `janus.object.id`, and the answer, `janus.allowed` |
| `janus.list` | the subject, `janus.permission`, `janus.object.type`, and `janus.page.items`, how many it found |
| `janus.grant`, `janus.revoke` | the object, `janus.relation`, and the subject — `janus.subject.relation` for a subject set, read as `permissions()` reads it: a user with a field named `relation` is that user, and a set on a user type is one only when `setOf()` made it |

**A refusal is an answer, not a failure.** A wrong password, a taken login, a
spent token, a denial: the span is `ok`, and a refusal carries
`janus.refusal`, its code. A failure — `STORE_FAILED`, `UNSUPPORTED`,
`PERMISSION_DEPTH`, `HASH_UNSUPPORTED`, or anything that is not a `JanusError`
— fails the span, with `janus.error.code`, and `janus.store.slot` and
`janus.store.operation` naming the store that could not answer.

### Events

Logs from the source `@nxgt/janus`, each with `janus.user.type` and `user.id`
when the flow knows them — `janus.signOut` carries neither:

| Event | Severity | When |
| --- | --- | --- |
| `janus.signUp` | info | a user signed up |
| `janus.signInCode.sent` | info | `signInCode.request` issued a code, with the `user.id` it is for. A request that answered `null` writes nothing |
| `janus.signIn` | info | a user signed in — by `signIn`; by `signInCode.confirm`, which adds `janus.signIn.code: true`; by `secondFactor.confirm`, which adds `janus.signIn.secondFactor: true`; or by `secondFactor.recover`, which adds `janus.signIn.recoveryCode: true` and `janus.secondFactor.recoveryCodesLeft` — a count, never a code |
| `janus.signIn.secondFactor` | info | the password, or an e-mailed code, was right and a second factor's code was asked for: `signIn` or `signInCode.confirm` answered a challenge. `janus.user.type` and the `user.id` the challenge answer carries — never the login typed |
| `janus.signIn.refused` | **warn** | a sign-in was refused, with `janus.refusal` — `CREDENTIALS_INVALID` with `janus.refusal.reason` (`unknownLogin`, `noPassword`, `wrongPassword`), `USER_INACTIVE` with the `user.id` of the deactivated user, or a refused `secondFactor.confirm` or `signInCode.confirm`: `CODE_INVALID` with `user.id` and `janus.secondFactor.attemptsLeft` — the same attribute for both — a `TOKEN_*` code (`TOKEN_STALE` with `user.id`), `SECOND_FACTOR_NOT_ENROLLED`, or `VERSION_CONFLICT` for a write that raced. Every refusal of `signInCode.confirm` adds `janus.signIn.code: true`, and every refusal of `secondFactor.recover` adds `janus.signIn.recoveryCode: true` |
| `janus.signIn.throttled` | **warn** | `signIn` refused a login past its attempts in the window — `@nxgt/janus`'s throttle, the right password included — with `janus.refusal: CREDENTIALS_INVALID`, `janus.refusal.reason: throttled`, `janus.user.type` and `janus.signIn.retryAfter`, the seconds until the next window. Never the login, never a `user.id`: an unknown login is throttled alike. Written instead of `janus.signIn.refused`, since no password was compared |
| `janus.secondFactor.enrolled`, `janus.secondFactor.activated`, `janus.secondFactor.disabled` | info | `enroll`, `activate` and `disable`, with the `user.id` they were called for |
| `janus.secondFactor.recoveryCodesRegenerated` | info | `regenerateRecoveryCodes`, with the `user.id` it was called for — never a code |
| `janus.stepUp.asked` | info | `stepUp.request` issued a challenge, with the `user.id` and `janus.stepUp.via` — `email` when a code is to be sent, `secondFactor` when the user's app confirms it |
| `janus.stepUp.confirmed` | info | `stepUp.confirm` stamped the session as freshly confirmed, with the session's `user.id` |
| `janus.stepUp.refused` | **warn** | a step-up was refused, with `janus.refusal` — `CODE_INVALID` with `user.id` and `janus.secondFactor.attemptsLeft`, a `TOKEN_*` code, `USER_INACTIVE`, `SECOND_FACTOR_ACTIVE`, `SECOND_FACTOR_NOT_ENROLLED`, or `VERSION_CONFLICT` for an app's code sent twice at once — never the code nor the challenge |
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
- **A refused sign-in for bad credentials names no user.** `janus.signIn.refused`
  with `CREDENTIALS_INVALID` carries the reason and the user type, never the
  login that was tried: `@nxgt/janus` throttles per login itself, and writes
  `janus.signIn.throttled` when it does; limiting per client is the
  application's, from the request. Only a refusal after the password was right, or against a
  challenge, carries `user.id`: `USER_INACTIVE`, a `CODE_INVALID`,
  `TOKEN_STALE` or `SECOND_FACTOR_NOT_ENROLLED`. Nor does
  `janus.signInCode.sent` name the address: a request for nobody writes
  nothing at all.
- **A wrong code is a warning, not a failure.** `CODE_INVALID` leaves the
  `janus.secondFactor.confirm`, `janus.secondFactor.recover` or
  `janus.signInCode.confirm` span `ok`, and
  writes `janus.signIn.refused` with `janus.secondFactor.attemptsLeft` — named
  so for an e-mailed code too: alert on a user whose count reaches `0` again
  and again, not on the span. **Every** refusal of `signInCode.confirm`
  carries `janus.signIn.code: true` — `CODE_INVALID`, a `TOKEN_*` code
  including `TOKEN_STALE`, `USER_INACTIVE` and `VERSION_CONFLICT` alike — so
  a filter on the mark sees the whole e-mailed-code flow.
- **One copy of `@nxgt/janus`.** A refusal is told from a failure by
  `instanceof JanusError`: with a second copy installed, every wrong password
  fails its span.

## Documentation

- [Tracing Janus](docs/guide/tracing.md) — wiring it with a Hono app, reading the spans and events, the audit trail, a sign-in with a second factor or an e-mailed code
- [Troubleshooting](docs/troubleshooting.md) — what you see, why, and the fix
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned

## Type safety, counted

Six plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case in `test/types/instrument.ts`. Three are refusals of
`@nxgt/janus` that must survive instrumenting, since an instrumented
instance is typed as the one it wraps:
- a sign-in without its password;
- a user type the instance does not have;
- a permission the model does not declare.

Three are this package's own:
- something other than a `janus()` instance passed to `instrumentJanus`;
- a `permissions()` instance passed to `instrumentJanus`;
- a `janus()` instance passed to `instrumentPermissions`.

## Licence

MIT
