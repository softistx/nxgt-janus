# Troubleshooting `@nxgt/janus-telemetry`

Each entry is headed by what you see. This package defines no error class and
throws nothing of its own: an error that reaches you is `@nxgt/janus`'s, as it
would be without it.

## Index

- [No `janus.*` span or event at all](#no-janus-span-or-event-at-all)
- [Some routes are traced, others not](#some-routes-are-traced-others-not)
- [`TypeError: Cannot add property …, object is not extensible` (Node), `Attempting to define property on object that is not extensible.` (Bun)](#typeerror-cannot-add-property--object-is-not-extensible)
- [A wrong password does not fail the span](#a-wrong-password-does-not-fail-the-span)
- [`janus.signIn.refused` has no `user.id`](#janussigninrefused-has-no-userid)
- [A `janus.signInCode.request` span with no `janus.signInCode.sent` event](#a-janussignincoderequest-span-with-no-janussignincodesent-event)
- [`janus.signIn.refused` with `TOKEN_SPENT` and `janus.signIn.magicLink`, for users who clicked once](#janussigninrefused-with-token_spent-and-janussigninmagiclink-for-users-who-clicked-once)
- [Every wrong password fails its span](#every-wrong-password-fails-its-span)
- [`janus.signIn.newDevice` never appears](#janussigninnewdevice-never-appears)

### No `janus.*` span or event at all

**When:** the flows answer, and the exporter receives nothing from them.

**Why:** no telemetry is installed, or the flows run outside it. Without one,
`@nxgt/telemetry` drops signals in silence, by design.

**Fix:** install one at startup, before the first request.

```ts
createTelemetry('clinic', { exporters: [consoleExporter()] }).install();
```

### Some routes are traced, others not

**When:** `janus.*` spans appear for some requests only.

**Why:** those routes use the unwrapped instance — imported from where
`janus()` was called, rather than the wrapped export.

**Fix:** export only the wrapped instance, and create it once:
`export const auth = instrumentJanus(janus({ … }))`.

### `TypeError: Cannot add property …, object is not extensible`

Under Bun: `TypeError: Attempting to define property on object that is not
extensible.`

**When:** assigning to the instance `instrumentJanus` or
`instrumentPermissions` answered.

**Why:** they answer a frozen copy, as `permissions()` itself does.

**Fix:** keep what you want to add beside the instance, not on it.

### A wrong password does not fail the span

**When:** a `janus.signIn` span is `ok` although the sign-in threw
`CREDENTIALS_INVALID` — or a `janus.secondFactor.confirm`,
`janus.secondFactor.recover` or `janus.signInCode.confirm` span is `ok` although the code was refused with
`CODE_INVALID`.

**Why:** a refusal is an answer — Janus worked. The span carries
`janus.refusal`, and the `janus.signIn.refused` warning says why; for a
refused code, the warning also carries `janus.secondFactor.attemptsLeft` —
under that name for an e-mailed sign-in code too. Only
a failure, such as `STORE_FAILED`, fails a span.

**Fix:** nothing. Query `janus.refusal` or the warning to count refusals.

```text
janus.refusal = "CODE_INVALID" AND janus.secondFactor.attemptsLeft = 0   -- challenges burnt by wrong codes
```

### `janus.signIn.refused` has no `user.id`

**When:** a sign-in refused with `CREDENTIALS_INVALID` carries the reason and
the user type, and no user. (`USER_INACTIVE` does carry `user.id`: the
password was right, so the user is known.)

**Why:** the error `@nxgt/janus` throws for bad credentials names no user —
`unknownLogin` has none to name, and the others do not say which, so a
response cannot tell which accounts exist. The login tried is never written.

The same for a refused `signInCode.confirm` with `TOKEN_UNKNOWN`,
`TOKEN_SPENT` or `TOKEN_EXPIRED`: the challenge is refused before any user is
read. Its `CODE_INVALID`, `TOKEN_STALE` and `USER_INACTIVE` do carry
`user.id`.

**Fix:** to count refusals per account, do it where the login is known — in
your sign-in route, from the request — not from telemetry.

### A `janus.signInCode.request` span with no `janus.signInCode.sent` event

**When:** a visitor asked for a sign-in code, the span is there with
`janus.user.type` and no `user.id`, and no event follows.

**Why:** `signInCode.request` answered `null` — nobody of that type holds the
address, or the user is inactive — and nothing was sent. The event is
written only for a code issued, and never with the address typed: the trail
must not become a list of addresses tried against your users.

**Fix:** nothing, if the address is nobody's. For a user you expected to
find, see
[`signInCode.request` answers `null` for a user who exists](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md#signincoderequest-answers-null-for-a-user-who-exists).

The same holds for a `janus.magicLink.request` span with no
`janus.magicLink.sent` event: `magicLink.request` answered `null`, for the
same reasons.

### `janus.signIn.refused` with `TOKEN_SPENT` and `janus.signIn.magicLink`, for users who clicked once

**When:** sign-in links answer `TOKEN_SPENT` on the first click the user
remembers, often for the users of one company's mail.

**Why:** a mail scanner — a gateway, a webmail's link check, an antivirus —
opened the link before the user, and the route that answers the link's
`GET` calls `magicLink.confirm`. The scanner's visit spent the token. The
span of that `GET` is the first `janus.magicLink.confirm` of the token, and
the user's click the second.

**Fix:** make the link's `GET` a page that spends nothing, and confirm from
its button's `POST`; see
[confirming from a `POST`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/magic-link.md#confirming-from-a-post-never-from-the-links-get).

### Every wrong password fails its span

**When:** `janus.signIn` spans fail with `janus.error.code` absent, for
refusals such as `CREDENTIALS_INVALID`.

**Why:** two copies of `@nxgt/janus` are installed — the application's and
another one, nested under a dependency. A refusal is recognised with
`instanceof JanusError`, which fails across copies, so it is taken for a
failure.

**Fix:** keep one copy: `bun pm ls | grep @nxgt/janus` should print one
version. Align the versions, or dedupe the lockfile.

### `janus.signIn.newDevice` never appears

**When:** users sign in from new browsers, and no `janus.signIn` log carries
`janus.signIn.newDevice`.

**Why:** the mark copies the answer's `newDevice`, and janus answers `false`
whenever the device is not tracked: `janus()` has no `devices`, the sign-in
was given no `{ device }` — absent is "not tracked", `null` is "a device
holding no token" — or, with a second factor, `{ device }` was given to
`signIn` but not again to `secondFactor.confirm` or `recover`, which open
the session.

**Fix:** wire `devices`, and give every call that opens a session the
device, `null` when the client holds no token.

```ts
await auth.secondFactor.confirm(challenge, code, { device: cookie ?? null });
```
