# Roadmap

Where `@nxgt/janus-graphql` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

- **`@permission`, enforced** — `@permission(name, type, id, onDeny)` on a
  field, a type or an interface lets a field resolve only for a user who holds
  permission `name` on the object of `type` whose id `id` reads: `args.<path>`
  or `parent.<path>`, `args.id` on a field and `parent.id` on a type when
  absent. It mirrors `@nxgt/janus-hono`'s `permission(access, permission, type, load)`.
  Repeated, every one must hold, checked in the order written; an either-or
  belongs in the model, not the schema. A denial answers `NOT_FOUND`, 404,
  unless `onDeny: FORBIDDEN` says otherwise, and the same question asked twice
  in one request — by two fields, or by a directive and a resolver's `can()`
  — costs one check. Until it lands, the directive is declared and a schema
  using it is refused at start-up.

## Next

- **Subscriptions over graphql-ws** — `janusConnection`, which authenticates
  a WebSocket connection once, from its `connectionParams` or its upgrade
  request, and gives every operation on it the same `ctx.janus`.
- **`@fresh(maxAge)`** — a field only a session signed in less than `maxAge`
  ago may resolve: a password change, a new e-mail, a payment method, asked
  again of a session that is days old.

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

Nothing released yet: the package is private until `@permission` lands. On
`develop`: `useJanus()` with the lazy `ctx.janus`, `@authenticated` on
fields, types and interfaces, `requireUser()` and `can()`, `janusMaskError()`,
and the SDL as `janusTypeDefs` and `graphql/janus.graphqls`.
