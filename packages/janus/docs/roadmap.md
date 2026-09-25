# Roadmap

Where `@nxgt/janus` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

- **A Hono integration** — in a package of its own, `@nxgt/janus-hono`:
  the session middleware, the cookie, a route guarded by a permission, the
  instances on the context, and every error as its status. Built, not yet
  published.

## Next

Nothing yet.

## Later

- **More official adapters** — the ports are cut where atomicity is not
  required, so users, sessions and permission tuples can each live in the
  database that suits them. MongoDB is the first adapter
  ([`@nxgt/janus-mongo`](https://www.npmjs.com/package/@nxgt/janus-mongo)).
- **A Redis adapter for sessions and tokens** — both are ephemeral and read on
  every request, which is why the port gives them slots of their own: they can
  live in Redis, with a native expiry, while users stay in another store.

## Not planned

- **`moduleResolution: "nodenext"`** — the package, its sources and its
  emitted declarations import without extensions, and resolve as Bun and every
  bundler do. Rewriting the declarations for `nodenext` was tried and reverted:
  it breaks the same contract one step later. Use `"moduleResolution":
  "bundler"`.
- **A Kratos-shaped surface** — no `identity.traits`, no login derived from a
  schema annotation (Kratos's `identifier`). A user is your schema's fields at the top level,
  and the flows are calls (`signUp`, `signIn`, `authenticate`).
- **`snake_case` keys** — every key, option and record field is `camelCase`,
  and a lint rule holds it. Error codes are `SCREAMING_SNAKE` because they are
  values, not keys.
- **Emitting a Kratos identity schema** — it would bring Ory's `snake_case`
  vocabulary into this package. If it ever exists, it is a separate package
  whose job is to speak that format.
- **A `total` on `CursorPage`** — a count over a cursor-paged collection is a
  second query, stale by the time you read it. `nextCursor` is the loop.
- **Store-assigned or numeric ids** — ids are UUIDv7 minted by the core, so
  they sort in creation order, the cursor is the last id, and an insert is
  idempotent under retry. An adapter cannot reuse an existing numeric key.
- **A required validation library** — schemas are any Standard Schema (Zod 4,
  Valibot, ArkType); none is imposed as a peer.
- **A silent hasher fallback** — a user type with a password and no `hasher`
  is refused at wiring, rather than hashed with something you did not choose.
- **Answering `null` or `false` on an outage** — a store that cannot answer
  throws `STORE_FAILED`, and a permission walk past `maxDepth` throws
  `PERMISSION_DEPTH`. Neither will become a denial: that turns an outage into
  a silent lockout.
- **Zanzibar's infrastructure** — no consistency tokens, no distributed
  cache. The tuples live in your own database, so a read already follows a
  write.
- **Deciding between 404 and 403** — `can()` answers one question; what a
  route reveals about an object it refuses is the application's decision.

## Shipped

The first public release, v0.1.

- **`defineModel` completed by your editor** — subject types and subject sets
  in a relation, subject types in `fromField`, relations, permissions and
  arrows in a rule and in `when`; a wrong name's error lists the names it
  could have been. — v0.1.2

- **The model decides what a stored tuple grants** — `can()` and `list()` follow
  only the holders a relation admits, as `grant()` writes only those: a tuple
  stored past `grant()`, by an older model or by hand, grants nothing. — v0.1
- **Guides and troubleshooting pages** — a `docs/` folder shipped in the
  package: detailed guides with examples, and the errors you can meet, each
  with its cause and fix. — v0.1
- **Permissions at `@nxgt/janus/permissions`** — and `janus({ relations })`,
  so deleting a user also deletes every tuple naming them. — v0.1
- **`list()`** — the ids of every object a subject holds a permission on, as a
  cursor page, `fromField` relations included through their `lookup`. — v0.1
- **`can()`, `grant()` and `revoke()`** — a permission check that answers
  `true` or `false` and throws on an outage, and tuple writes refused at
  compile time when the model does not admit them. — v0.1
- **Typed subjects and the `RelationStore` port** — `{ type, id }` subjects,
  the tuple notation, `createMemoryRelations()`, and
  `describeRelationStores` for adapter authors. — v0.1
- **A permission model typed from itself** — `defineModel` with subject sets,
  arrows, `fromField` relations read from your data, and `when` conditions
  written in TypeScript. — v0.1
- **Delete a user, and everything of theirs** — `delete(user)` removes the
  user with every session and one-time token they had, idempotently. — v0.1
- **Rehash a stale password on sign-in** — moving hashers, or raising a cost,
  reaches every active user with no migration to run. — v0.1
- **`janus()`** — sign-up, sign-in, sessions, e-mail verification and password
  reset, with several user types in one instance, typed from your schemas.
  — v0.1
- **The conformance suite** — `@nxgt/janus/conformance`, the suite an adapter
  runs, outages included. — v0.1
- **The identity stores' port and its in-memory reference** — `JanusStores` and
  `createMemoryStores()`, for your tests and as the model for an adapter.
  — v0.1
