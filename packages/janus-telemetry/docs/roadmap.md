# Roadmap

Where `@nxgt/janus-telemetry` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

- **The first release** — `instrumentJanus` and `instrumentPermissions`: a span
  per flow and per permission check, and the security events worth an audit
  trail. Built, not yet published.

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
- **Writing a login, an e-mail, a password, a token or a session id** — in any
  span or event, on any setting.
- **`moduleResolution: "nodenext"`** — like `@nxgt/janus`, the package imports
  without extensions. Use `"moduleResolution": "bundler"`.

## Shipped

Nothing yet: the package is not published.
