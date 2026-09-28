# Roadmap

Where `@nxgt/janus-graphql` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

Nothing between releases.

## Next

- **Subscriptions over graphql-ws** — `janusConnection`, which authenticates
  a WebSocket connection once, from its `connectionParams` or its upgrade
  request, and gives every operation on it the same `ctx.janus`.
- **`@fresh(maxAge)`** — a field only a session signed in less than `maxAge`
  ago may resolve: a password change, a new e-mail, a payment method, asked
  again of a session that is days old.
- **The renewed session cookie on GraphQL responses** — `authenticate`
  renews a sliding session in passing; the response would then carry its
  `Set-Cookie`, so a browser keeps the new expiry without an HTTP route of
  its own.

## Later

Nothing yet.

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
