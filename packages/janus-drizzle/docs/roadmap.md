# Roadmap

Where `@nxgt/janus-drizzle` is heading. It shows a direction, not a
commitment: there are no dates here, and the only number is the version
something shipped in.

## Now

Nothing yet.

## Next

Nothing yet.

## Later

Nothing yet.

## Not planned

- **MySQL and SQLite.** `@nxgt/drizzle` is PostgreSQL only, and so is this
  adapter: the tuple constraint, `for update` and `collate "C"` are
  PostgreSQL's.
- **PostgreSQL before 15.** The tuple constraint needs `unique nulls not
  distinct`.
- **Creating the tables from the store.** Your migrations create them, from
  the exported tables. The stores never create anything per request.
- **Retrying a transaction for you.** A write is idempotent, so retry it
  yourself, on your own terms.
- **Error classes of its own.** The adapter throws `@nxgt/janus`'s classes,
  which is why `@nxgt/janus` is a required peer and never a dependency:
  `instanceof StoreFailure` has to hold in your code.
- **`moduleResolution: "nodenext"`.** Like `@nxgt/janus`, the package imports
  without extensions and resolves as Bun and every bundler do. Use
  `"moduleResolution": "bundler"`.

## Shipped

- **The first release, v0.1.0.** Both sides of `@nxgt/janus` over one
  PostgreSQL database, on Drizzle; the adapter passes both conformance suites
  on PostgreSQL 17 and PGlite. `defineJanusTables({ schema? })` puts the tables
  in a database or a schema of their own, with no prefix, and the factories
  take the tables your schema file exports, so the stores query exactly what
  your drizzle-kit migration created.
