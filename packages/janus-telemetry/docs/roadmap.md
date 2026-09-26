# Roadmap

Where `@nxgt/janus-telemetry` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

Nothing yet.

## Next

Nothing yet.

## Later

- **Metrics** — sign-ins, refusals and checks as counters, once
  `@nxgt/telemetry` carries metrics as a third signal.
- **Store spans** — a span per store call, for an adapter with no
  instrumentation of its own. MongoDB has one:
  `@nxgt/telemetry-mongo`'s `instrumentMongo`.

## Not planned

- **An OpenTelemetry SDK** — like `@nxgt/telemetry`, it speaks OTLP through its
  exporters and depends on no `@opentelemetry/*` package.
- **Writing a login, an e-mail, a password, a session token, a one-time token
  or a session id** — in any span or event, on any setting.
- **`moduleResolution: "nodenext"`** — like `@nxgt/janus`, the package imports
  without extensions. Use `"moduleResolution": "bundler"`.

## Shipped

Newest first; the [CHANGELOG](../CHANGELOG.md) holds every release.

- **The second factor in the audit trail, v0.2.0** — `janus.signIn` records
  `janus.signIn.status`; the events `janus.signIn.secondFactor`,
  `janus.secondFactor.enrolled`, `.activated` and `.disabled`; and a refused
  code warns with `janus.secondFactor.attemptsLeft`. No secret, challenge or
  code is ever written. Needs `@nxgt/janus` 0.5.0.
- **The audit trail reads subjects as `permissions()` does, v0.1.1** — a user
  with a field named `relation` is recorded as that user, and a subject set on
  a user type only when `setOf()` made it. Needs `@nxgt/janus` 0.3.0.
- **The first release, v0.1.0** — `instrumentJanus` and
  `instrumentPermissions`: a span per flow and per permission check, and the
  security events worth an audit trail.
