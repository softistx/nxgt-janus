# Roadmap

Where `@nxgt/janus-graphql` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

Nothing between releases.

## Next

Nothing yet.

## Later

- **Anonymous graphql-ws connections** — `janusConnection({ anonymous:
  true })`, accepting a connection with no credential so its public fields
  answer and its guarded ones deny, as over HTTP.
- **Re-authenticating a subscription on each event** — an opt-in for
  streams that must end the moment their session is revoked, at the cost
  of a sessions-store read per event.

## Not planned

- **Filtering a list by permission** — no directive drops the items of a list
  the user may not see. Loading every item and checking each is a query that
  grows with the table; ask the question the other way round with
  `access.list()`, which answers the ids the user holds a permission on, and
  load only those.
- **Introspection control and rate limiting** — neither is about who the user
  is. Envelop and Yoga have plugins for both; this package stays out of their
  way.
- **Error classes of its own** — a denial is a `GraphQLError`, and anything
  else is `@nxgt/janus`'s, which is why `@nxgt/janus` is a required peer and
  never a dependency.
- **`moduleResolution: "nodenext"`** — like `@nxgt/janus`, the package
  imports without extensions. Use `"moduleResolution": "bundler"`.

## Shipped

Newest first; from the first release on, the package's CHANGELOG holds every one.

- **A throttled e-mail request's `retryAfter`, v0.6.0.**
  `janusGraphQLError()` answers `@nxgt/janus`'s `MAIL_THROTTLED` with 429,
  `retryAfter` in `extensions`, a `Retry-After` header in
  `extensions.http.headers` and the message `Too many requests, retry later`.
  Needs `@nxgt/janus` 0.18.0.

- **A throttled sign-in's `retryAfter`, v0.5.0.** `janusGraphQLError()`
  answers `@nxgt/janus`'s throttled `CREDENTIALS_INVALID` with `retryAfter`
  in `extensions` and a `Retry-After` header in `extensions.http.headers`,
  which Yoga answers with. Needs `@nxgt/janus` 0.14.0.

- **The renewed session cookie, and `report` for every outage, v0.4.0.**
  Under Yoga, `useJanus()` sends a session `authenticate` renewed back as
  `Set-Cookie`, so a browser keeps the new expiry without an HTTP route of
  its own — only to a request that presented the session cookie, never to a
  bearer token or `X-Session-Token`, and never when nothing authenticated.
  `janusMaskError({ report, fallback })` hands every `JanusError` answered
  5xx to your logger, once, including the outages a directive or a helper
  answers 503 on its own; a `report` that throws never changes the answer.
  `janusMaskError(fallback)` still works.

- **Subscriptions over graphql-ws, `janusConnection()`, v0.3.0.** The same
  `@authenticated`, `@fresh` and `@permission` on subscriptions served over
  a WebSocket with graphql-ws: `onConnect` for its `useServer()`
  authenticates the connection from `connectionParams.authorization` — else
  from the upgrade request's headers and the browser's session cookie —
  and refuses it `4403`, or rejects on an outage, closed `4500`. Each
  operation's `ctx.janus` is built by `useJanus()` from that credential, in
  Yoga's recommended setup, and authenticated again when it subscribes, so
  a session revoked since the connection opened is refused at the next
  subscribe. `context` for a server without Yoga, `upgrade` for Bun.
  `graphql-ws` is an optional peer, `^6.0.0`, whose floor runs in CI.

- **`@fresh(maxAge)` and `requireFresh()`, v0.2.0.** A field, a type or an
  interface only a session that proved who it is less than `maxAge` seconds
  ago may resolve — signed in, or confirmed since by `auth.stepUp.confirm`:
  a new e-mail or a payment method, asked again of a session that is days
  old. An older session is `STEP_UP_REQUIRED`, 403, which tells the client
  to ask for a step-up; checked after `@authenticated` and before any
  `@permission`, and for a subscription when it subscribes.
  `requireFresh(ctx, '10m')` is the same check in a resolver, and
  `useJanus({ clock })` the clock both read. `@nxgt/janus` 0.12's
  `assertFresh` is the check.

- **The first release, v0.1.0.** GraphQL for `@nxgt/janus`, as an envelop
  plugin: `useJanus()` with a lazy `ctx.janus`, authenticated only when a
  field asks; `@authenticated` on fields, types and interfaces, for any user
  or some user types; `@permission(name, type, id, onDeny)`, reading the id
  from `args.<path>` or `parent.<path>`, loading an object by id through
  `loaders` and a condition's `ctx` through `conditions`, one check per
  question per request, and a denial answered `NOT_FOUND` unless
  `onDeny: FORBIDDEN`; `requireUser()` and `can()` for a resolver;
  `janusMaskError()`, an outage as 503; and the SDL as `janusTypeDefs` and
  `graphql/janus.graphqls`. What no request could pass is refused at
  start-up, naming the field. The specs and the typecheck also run on the
  peer floors — `graphql` 16.9.0, `@graphql-tools/utils` 10.0.0 and
  `@envelop/core` 5.0.0 — in CI.
