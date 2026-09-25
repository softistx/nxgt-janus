# Troubleshooting `@nxgt/janus-telemetry`

Each entry is headed by what you see. This package defines no error class and
throws nothing of its own: an error that reaches you is `@nxgt/janus`'s, as it
would be without it.

## Index

- [No `janus.*` span or event at all](#no-janus-span-or-event-at-all)
- [Some routes are traced, others not](#some-routes-are-traced-others-not)
- [`TypeError: Cannot add property …, object is not extensible`](#typeerror-cannot-add-property--object-is-not-extensible)
- [A wrong password does not fail the span](#a-wrong-password-does-not-fail-the-span)
- [`janus.signIn.refused` has no `user.id`](#janussigninrefused-has-no-userid)

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

**When:** assigning to the instance `instrumentJanus` or
`instrumentPermissions` answered.

**Why:** they answer a frozen copy, as `permissions()` itself does.

**Fix:** keep what you want to add beside the instance, not on it.

### A wrong password does not fail the span

**When:** a `janus.signIn` span is `ok` although the sign-in threw
`CREDENTIALS_INVALID`.

**Why:** a refusal is an answer — Janus worked. The span carries
`janus.refusal`, and the `janus.signIn.refused` warning says why. Only a
failure, such as `STORE_FAILED`, fails a span.

**Fix:** nothing. Query `janus.refusal` or the warning to count refusals.

### `janus.signIn.refused` has no `user.id`

**When:** a refused sign-in's event carries the reason and the user type, and
no user.

**Why:** the error `@nxgt/janus` throws for a refused sign-in names no user —
`unknownLogin` has none to name, and the others do not say which, so a
response cannot tell which accounts exist. The login tried is never written.

**Fix:** to count refusals per account, do it where the login is known — in
your sign-in route, from the request — not from telemetry.
