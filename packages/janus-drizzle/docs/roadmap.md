# Roadmap

Where `@nxgt/janus-drizzle` is heading. It shows a direction, not a
commitment: there are no dates here, and the only number is the version
something shipped in.

## Now

- **The first release.** The adapter passes both conformance suites on
  PostgreSQL 17 and PGlite. It stays unpublished until its release is decided.

- **Tables without a prefix, in a database or a schema of their own.**
  `defineJanusTables({ schema? })` replaces the `janus_*` tables, so Janus's
  tables are backed up and restored on their own. Not yet released, so no
  migration is owed.

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

Nothing yet.
