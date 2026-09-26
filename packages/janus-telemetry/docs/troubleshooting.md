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
- [Every wrong password fails its span](#every-wrong-password-fails-its-span)

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
`CREDENTIALS_INVALID` — or a `janus.secondFactor.confirm` span is `ok` although the
code was refused with `CODE_INVALID`.

**Why:** a refusal is an answer — Janus worked. The span carries
`janus.refusal`, and the `janus.signIn.refused` warning says why; for a
refused code, the warning also carries `janus.secondFactor.attemptsLeft`. Only
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

**Fix:** to count refusals per account, do it where the login is known — in
your sign-in route, from the request — not from telemetry.

### Every wrong password fails its span

**When:** `janus.signIn` spans fail with `janus.error.code` absent, for
refusals such as `CREDENTIALS_INVALID`.

**Why:** two copies of `@nxgt/janus` are installed — the application's and
another one, nested under a dependency. A refusal is recognised with
`instanceof JanusError`, which fails across copies, so it is taken for a
failure.

**Fix:** keep one copy: `bun pm ls | grep @nxgt/janus` should print one
version. Align the versions, or dedupe the lockfile.
