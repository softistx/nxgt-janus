# Roadmap

Where `@nxgt/janus-hono` is heading. A direction, not a commitment: there are
no dates here, and the version something shipped in is the only number.

## Now

- **The first release** — `@nxgt/janus-hono` 0.1 on npm: `session()`,
  `sendSession`, `signOut`, `permission()`, `provide()`, `janusErrors`. Built,
  not yet published.

## Next

Nothing yet.

## Later

Nothing yet.

## Not planned

- **A middleware that guesses the object** — `permission()` takes a `load`
  and never reads a path parameter or a table for you: the application knows
  where its objects live.
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

Nothing yet: the package is not published.
