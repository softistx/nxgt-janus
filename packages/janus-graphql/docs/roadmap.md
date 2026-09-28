# Roadmap

Where `@nxgt/janus-graphql` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

- **The first release** — the package published, now that its floors hold.

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

Nothing released yet: the package is private until its first release.

### Unreleased, on `develop`

- **The floors, measured** — the specs and the typecheck run on the oldest
  `graphql` (16.9.0), `@graphql-tools/utils` (10.0.0) and `@envelop/core`
  (5.0.0) the peer ranges admit, together and with one copy of `graphql`, in
  CI's Floors job, so the ranges the README states are ones a suite has
  passed.
- **`@permission`, enforced** — `@permission(name, type, id, onDeny)` on a
  field, a type or an interface lets a field resolve only for a user who
  holds permission `name` on the object of `type` whose id `id` reads:
  `args.<path>` or `parent.<path>`, `args.id` on a field and `parent.id` on a
  type or an interface when absent. The parent is checked itself, so its
  `fromField`s are read from it; an id alone is loaded by
  `useJanus({ loaders })`, and a condition's `ctx` comes from
  `useJanus({ conditions })`. A list of ids requires the permission on every
  one. Repeated, every one must hold, asked in order; a denial answers
  `NOT_FOUND`, 404, unless `onDeny: FORBIDDEN`. The same question asked twice
  in one request — by two fields, or by a directive and `can()` — is one
  check. What no request could pass is refused at start-up, naming the
  field.
- **The first slice** — `useJanus()` with the lazy `ctx.janus`,
  `@authenticated` on fields, types and interfaces, `requireUser()` and
  `can()`, `janusMaskError()`, and the SDL as `janusTypeDefs` and
  `graphql/janus.graphqls`.
