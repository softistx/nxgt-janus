# Roadmap

Where `@nxgt/janus` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

- **A PostgreSQL adapter** — in a package of its own, `@nxgt/janus-drizzle`,
  on Drizzle: both sides over one database, the tables in your own drizzle-kit
  migrations. Built, not yet published.
- **Tracing and an audit trail** — in a package of its own,
  `@nxgt/janus-telemetry`: a span per flow and per permission check, and the
  security events worth keeping, never a login, a password, a session token
  or a one-time token. Built, not yet published.
- **A Redis adapter for sessions and tokens** — in a package of its own,
  `@nxgt/janus-redis`: both are read on every request and ephemeral, so they
  live in Redis, expired by Redis itself, while users stay in another store.
  Built, not yet published.

## Next

- **One-time codes** — a one-time token short enough to type, sent by e-mail
  to sign in without a password, or to confirm a sensitive action, issued
  and redeemed by `janus` like the verification and reset tokens today; and
  TOTP, the codes of an authenticator app, as a second factor.
- **Sending the e-mails** — in a package of its own, `@nxgt/janus-mail`: a
  `Mailer` port you plug your transport into (SMTP, Resend, SES…) — a
  transport that fails throws, like a store — and default templates for
  verification, password reset and one-time codes. The templates are built with Maizzle and Tailwind CSS 4 when the package is built — CSS
  inlined for mail clients — and ship as typed functions:
  `templates.verifyEmail({ link })` answers `{ subject, html, text }`,
  every value escaped, a missing or misspelled variable a compile error. No
  template engine at run time. The defaults are a starting point, not a
  requirement: replace any one template with your own function of the same
  shape — built with your own Maizzle project, React Email or a plain string —
  and keep the defaults for the rest.
- **Webhooks** — signed HTTP events when something happens to a user
  (created, e-mail verified, password reset, deleted), so another service can
  follow without polling: a signature it can check, retries on failure, and
  the same rule as the audit trail — the user named by id, never a login, a
  password, a session token or a one-time token in a payload, and every key
  camelCase. Retries that run out are reported, never dropped in silence.

## Later

- **More official adapters** — the ports are cut where atomicity is not
  required, so users, sessions and permission tuples can each live in the
  database that suits them. MongoDB is the first adapter
  ([`@nxgt/janus-mongo`](https://www.npmjs.com/package/@nxgt/janus-mongo));
  PostgreSQL is under Now.

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

- **The model's keys read `related` and `permits`** — Keto's OPL words: an
  object type declares `related: { members: ['staff', 'team#members'] }` and
  `permits: { view: ['members'] }`, and relation names are plural by convention. Breaking:
  `relations` and `permissions` as keys are refused, by the compiler and by
  `defineModel`, with a message naming the new key —
  `types.team.relations is now related: rename the key`. The `permissions()`
  function and `janus({ relations })` keep their names. — next minor
- **`LOGIN_TAKEN` no longer quotes the login in its message**, in the memory
  store and in both adapters; `error.login` still names it, and the
  conformance suite checks it. — next patch
- **The conformance suite accepts a store with its own expiry** — a store
  that drops a lapsed session at once, as a Redis TTL does, passes
  `sessions.deleteUser`; one that still holds it must count it. — next patch

- **A Hono integration** — [`@nxgt/janus-hono`](https://www.npmjs.com/package/@nxgt/janus-hono):
  the session middleware, the cookie, a route guarded by a permission,
  `bindJanus()` to bind the instances once, and every error as its status.
  Its own 0.1.0, beside `@nxgt/janus` 0.1.3.
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
