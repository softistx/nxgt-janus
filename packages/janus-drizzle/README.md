# @nxgt/janus-drizzle

The PostgreSQL adapter for [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus):
its identity stores (users, sessions and one-time tokens) and the relation
store of `@nxgt/janus/permissions`, over one database. It works through your
[Drizzle](https://orm.drizzle.team) instance and uses
[`@nxgt/drizzle`](https://www.npmjs.com/package/@nxgt/drizzle) for
transactions and error translation.

It passes both `@nxgt/janus/conformance` suites on a real PostgreSQL 17,
outages and concurrency included, and on PGlite. `createDrizzleAdapter(db)`
returns both sides under the names `janus()` takes, so one spread wires them.
Each side also works alone, as in `@nxgt/janus`: `createDrizzleStores` for
identities, `createDrizzleRelations` for permissions.

```ts
// src/db/schema.ts — the file drizzle-kit reads
export {
  janusLogins,
  janusRelations,
  janusSessions,
  janusTokens,
  janusUsers,
} from '@nxgt/janus-drizzle';
```

```ts
import { janus, scryptHasher } from '@nxgt/janus';
import { permissions } from '@nxgt/janus/permissions';
import { createDrizzleAdapter } from '@nxgt/janus-drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';

const db = drizzle(process.env.DATABASE_URL);
const postgres = createDrizzleAdapter(db); // { store, relations }

export const auth = janus({
  user: User,
  password: { login: 'email' },
  hasher: scryptHasher(),
  ...postgres, // deleting a user deletes their tuples too
});

export const access = permissions({ model, store: postgres.relations });
```

`drizzle-kit generate` then writes the five tables into your next migration,
the same way it writes your own tables.

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-drizzle @nxgt/janus @nxgt/drizzle drizzle-orm
```

Every peer is required:
- `@nxgt/janus`;
- `@nxgt/drizzle`, `>=0.6.1 <1`;
- `drizzle-orm`, 1.0 (from `1.0.0-rc.4`);
- `typescript` 6.

`@nxgt/janus` is a **peer**, never a dependency. This package defines no error
class and throws the peer's own, so `instanceof StoreFailure` holds in your
code.

It needs **PostgreSQL 15 or later**, because the tuple constraint is
`unique nulls not distinct`.

Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`. The
declarations import without extensions, so `nodenext` is not supported.

## API

| Export | What it is |
| --- | --- |
| `createDrizzleAdapter(db)` | Returns `{ store, relations }`, both of the entries below, keyed as `janus()` takes them, so `janus({ …, ...postgres })` wires both. It connects to nothing and creates nothing. |
| `DrizzleAdapter` | The type of what `createDrizzleAdapter` returns. |
| `createDrizzleStores(db)` | The `{ users, sessions, tokens }` that `janus()` takes as `store`. |
| `createDrizzleRelations(db)` | The `RelationStore` that `permissions()` takes as `store`, and `janus()` takes as `relations`. |
| `janusUsers`, `janusLogins`, `janusSessions`, `janusTokens`, `janusRelations` | The five tables, as Drizzle `pgTable`s. Export them from your schema so your migrations create them. |
| `janusTables` | The five tables as one object. Use it with drizzle-kit's API, or to query them yourself. |

`db` is any Drizzle PostgreSQL instance: `node-postgres`, `postgres.js`,
`bun-sql` or PGlite. A connection string, a raw driver client or a SQLite
Drizzle does not compile.

## What the database holds

The port's records, one column per field. Nothing is encoded, so a row read in
`psql` looks like the record in the code. Every table name starts with
`janus_`, so none collides with your own `users`.

| Table | Keys and indexes |
| --- | --- |
| `janus_users` | `id` · `(id, type)` unique, for the logins' foreign key · `(type, id)` for listing · a check that a password has both its hash and its date, or neither |
| `janus_logins` | primary key `(type, login)`: **a login is unique per user type** · `(user_id, type)` references the user, `on delete cascade` |
| `janus_sessions` | `id` · `token_hash` unique · `user_id` · `expires_at`, for `collectExpired()` |
| `janus_tokens` | `token_hash` · `user_id` · a check on `kind` |
| `janus_relations` | one row per tuple, unique `nulls not distinct` over all six columns, subject first: the index `findObjects` pages · `(object_type, object_id, relation)` for one hop forwards |

`logins` is also a `text[]` on `janus_users`, which the store reads back in
order. PostgreSQL has no unique index over the elements of an array, so
`janus_logins` plays that role, written in the same transaction as the user.

Every key column is `text collate "C"`, compared byte for byte as the port
requires. No secret is stored: sessions and tokens hold `sha256` of the secret,
and passwords a self-describing hash.

## Traps

- **Your migrations create the tables, not this package.** The core never
  manages a schema, and the stores create nothing per request. Without the
  exports in your schema file, the first sign-up fails with `STORE_FAILED`,
  caused by `relation "janus_users" does not exist`.
- **Keep all five exports in the schema file.** drizzle-kit writes a
  `DROP TABLE` for a table the schema no longer names.
- **Call `auth.collectExpired()` on a schedule.** PostgreSQL has no TTL, so
  lapsed sessions stay in `janus_sessions` until something deletes them. The
  core still refuses them on every read.
- **A unique violation on anything but a login is a `StoreFailure`, not
  `LOGIN_TAKEN`.** Such a violation is an adapter bug. Reporting it as a taken
  login would tell somebody their e-mail is in use when it is not.
- **A user's write and a relation write of more than one tuple are
  transactions**, through `@nxgt/drizzle`'s `withTransaction`. They are not
  retried: a write is idempotent, so retry it yourself.
- **Columns are `snake_case`.** This follows PostgreSQL's own convention and
  `@nxgt/drizzle`'s columns, so hand-written SQL needs no quotes. The records
  the stores return are camelCase, as everywhere in Janus.

## Documentation

- [Guides](docs/README.md): wiring the stores, and the tables in your migrations
- [Troubleshooting](docs/troubleshooting.md): look up the error message you see
- [Roadmap](docs/roadmap.md): what is next, and what is not planned

## Type safety, counted

Three plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case in `test/types/adapter.ts`:
- a connection string instead of a Drizzle instance;
- the driver's client instead of the Drizzle instance over it;
- a Drizzle instance over SQLite.

## Licence

MIT
