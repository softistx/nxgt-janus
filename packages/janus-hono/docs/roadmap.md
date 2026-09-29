# Roadmap

Where `@nxgt/janus-hono` is heading. A direction, not a commitment: there are
no dates here, and the version something shipped in is the only number.

## Now

Nothing in progress.

## Next

Nothing yet.

## Later

Nothing yet.

## Not planned

- **A middleware that guesses the object** — `permission()` takes a `load`
  and never picks a path parameter or a table for you: the application knows
  where its objects live. `byParam('id', find)` reads the parameter it is
  named, with the `find` it is given.
- **Routes of its own** — no `/sign-in` mounted for you. Every application
  names, validates and answers its routes its own way; the flows are one call
  each.
- **Body validation** — the shape of a request body is the route's to check,
  with Hono's validator or your own. `janus()` validates the fields against
  your schema, not that `password` is a string.
- **Error classes of its own** — it throws nothing but `@nxgt/janus`'s, which
  is why `@nxgt/janus` is a required peer and never a dependency.
- **`moduleResolution: "nodenext"`** — like `@nxgt/janus`, the package imports
  without extensions. Use `"moduleResolution": "bundler"`.

## Shipped

Newest first; the [CHANGELOG](../CHANGELOG.md) holds every release.

- **The device cookie, v0.6.0** — `deviceOf(c)` reads the device token a
  browser holds, for a sign-in's `device`, and `sendSession` sets it — or
  sets it again for another 400 days — whenever `@nxgt/janus`'s answer
  carries a `deviceToken`: `janus-device` (`DEVICE_COOKIE`), `HttpOnly`,
  `Secure`, `SameSite=Lax`, `Path=/`, changed by `DeviceCookieOptions`.
  `signOut` leaves it. Needs `@nxgt/janus` 0.17.0.
- **The routes of a sign-in link, v0.5.1** — the routes guide's
  [A link sent by e-mail](guide/routes.md#a-link-sent-by-e-mail): a page
  that spends nothing, a `POST` behind `csrf()` that confirms, and the
  second factor's challenge handed on. Needs `@nxgt/janus` 0.15.0.
- **A throttled sign-in's `retryAfter`, v0.5.0** — `janusErrors()` and
  `bodyOf()` answer `@nxgt/janus`'s throttled `CREDENTIALS_INVALID` with
  `retryAfter` in the body and a `Retry-After` header. Needs `@nxgt/janus`
  0.14.0.
- **`fresh(maxAge)`, v0.4.0** — a middleware that lets a route run only for
  a session that proved who it is less than `maxAge` ago, signed in or
  confirmed by a step-up; `janusErrors()` answers `STEP_UP_REQUIRED` with
  403. Needs `@nxgt/janus` 0.12.0.
- **The second factor's errors as statuses, v0.3.0** — `janusErrors()`
  answers `CODE_INVALID` with 401 and `attemptsLeft` in the body, and
  `SECOND_FACTOR_NOT_ENROLLED` and `SECOND_FACTOR_ACTIVE` with 409. Needs
  `@nxgt/janus` 0.5.0.
- **Examples and guides on `related` and `permits`, v0.2.0** — the model keys
  of `@nxgt/janus` 0.2, which it now requires.
- **The first release** — `session()`,
  `sendSession` (which answers the user), `signOut`, `permission()` and
  `byParam`, `provide()`, `janusErrors({ report, fallback })`, and
  `bindJanus()` binding them to the instances once. — v0.1
