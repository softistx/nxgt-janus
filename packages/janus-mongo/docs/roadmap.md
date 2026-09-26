# Roadmap

Where `@nxgt/janus-mongo` is heading. A direction, not a commitment: there are
no dates here, and the version something shipped in is the only number.

## Now

Nothing in progress.

## Next

Nothing yet.

## Later

Nothing yet.

## Not planned

- **`collectExpired()` with this adapter** — it answers `UNSUPPORTED` on
  purpose. The TTL indexes on `sessions` and `tokens` already drop lapsed
  records, and the core decides expiry on every read regardless.
- **Retrying a relation transaction for you** — the driver's
  `withTransaction` would retry an outage for two minutes before answering. A
  relation write is idempotent, so retry it yourself, on your own terms.
- **Multi-tuple relation writes on a standalone mongod** — a write of more
  than one tuple is a transaction, and MongoDB runs transactions on a replica
  set only. `grant` and `revoke` write one tuple and run anywhere.
- **Managing the schema from the store** — the collections and indexes are
  created by `syncMongoStores` and `syncMongoRelations`, a deployment step you
  run. The stores never create anything per request.
- **Error classes of its own** — the adapter throws `@nxgt/janus`'s classes,
  which is why `@nxgt/janus` is a required peer and never a dependency:
  `instanceof StoreFailure` has to hold in your code.
- **`moduleResolution: "nodenext"`** — like `@nxgt/janus`, the package imports
  without extensions and resolves as Bun and every bundler do. Use
  `"moduleResolution": "bundler"`.

## Shipped

Each entry names the version it came in; `CHANGELOG.md` holds the rest.

- **A user's tokens spent in one write, v0.4.0** — for `@nxgt/janus` 0.7:
  `spendUserTokens(userId, kind, at)` is one `updateMany`, and passes the
  three new conformance cases. No sync needed: it reads through the
  `userId` index the collection already has.
- **A second factor on a user, and attempts counted on a token** — the stores
  keep a user's `secondFactor` and a token's `codeHash` and `attempts`, and
  `countAttempt` counts an attempt at a code in one conditional write, for
  `@nxgt/janus` 0.4. Documents written before read as no second factor and no
  attempt; run the sync before deploying. — v0.3.0
- **The permission model written with `related` and `permits`**, the keys of
  `@nxgt/janus` 0.2, which it requires. — v0.2.0
- **`LOGIN_TAKEN` no longer quotes the login in its message**; `error.login`
  still names it. — v0.2.0
- **One call for both sides** — `createMongoAdapter(db)` answers
  `{ store, relations }`, spread into `janus()` so deleting a user deletes
  their tuples without a second wiring; `syncMongoAdapter(db)` syncs the four
  collections in one step. — v0.1.2
- **Guides and troubleshooting pages** — a `docs/` folder shipped in the
  package, with the errors and traps you can meet running the adapter, each
  with its cause and fix. — v0.1
- **The relation store** — `createMongoRelations(db)` and
  `syncMongoRelations(db)`: the `RelationStore` of `@nxgt/janus/permissions`,
  one document per tuple, and `findObjects` served by an index with no
  in-memory sort. — v0.1
- **Deleting a user, and everything of theirs** — the stores delete a user's
  sessions and one-time tokens with them, as `delete(user)` requires. — v0.1
- **Users, sessions and one-time tokens** — `createMongoStores(db)` and
  `syncMongoStores(db)`, passing the `@nxgt/janus/conformance` suite against a
  real mongod, outages included. — v0.1
