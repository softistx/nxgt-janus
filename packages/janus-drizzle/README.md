# @nxgt/janus-drizzle

The PostgreSQL adapter for [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus):
its identity stores (users, sessions and one-time tokens) and the relation
store of `@nxgt/janus/permissions`, over one database. It works through your
[Drizzle](https://orm.drizzle.team) instance and uses
[`@nxgt/drizzle`](https://www.npmjs.com/package/@nxgt/drizzle) for
transactions and error translation.

It passes both `@nxgt/janus/conformance` suites on a real PostgreSQL 17 —
over `node-postgres`, postgres.js and Bun's `SQL`, outages and concurrency
included — and on PGlite. `createDrizzleAdapter(db)`
returns both sides under the names `janus()` takes, so one spread wires them.
Each side also works alone, as in `@nxgt/janus`: `createDrizzleStores` for
identities, `createDrizzleRelations` for permissions.

```ts
// src/janus/schema.ts — the file drizzle-kit reads
import { defineJanusTables } from '@nxgt/janus-drizzle';

export const { users, logins, sessions, tokens, relations } = defineJanusTables();
```

```ts
import { janus, scryptHasher } from '@nxgt/janus';
import { permissions } from '@nxgt/janus/permissions';
import { createDrizzleAdapter } from '@nxgt/janus-drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { model, User } from './model'; // your user schema and permission model

// Janus's own database: backed up and restored on its own
const db = drizzle(process.env.JANUS_DATABASE_URL ?? 'postgres://localhost:5432/janus');
const postgres = createDrizzleAdapter(db); // { store, relations }

export const auth = janus({
  user: User,
  password: { login: 'email' },
  hasher: scryptHasher(),
  ...postgres, // deleting a user deletes their tuples too
});

export const access = permissions({ model, store: postgres.relations });
```

`drizzle-kit generate` then writes the five tables into a migration, the same
way it writes your own. **Give them a database of their own**, as here, with a
drizzle-kit config of its own: `pg_dump` and `pg_restore` then back up and
restore Janus alone. Beside your tables in one database, put them in a
PostgreSQL schema of their own instead, exported with the tables and passed
to the adapter as `{ tables }`:
[Where the tables live](docs/guide/database.md) has both.

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-drizzle @nxgt/janus @nxgt/drizzle drizzle-orm
bun add pg   # the driver the example below uses — or postgres, or none on Bun's SQL
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
| `createDrizzleAdapter(db, options?)` | Returns `{ store, relations }`, both of the entries below, keyed as `janus()` takes them, so `janus({ …, ...postgres })` wires both. It connects to nothing and creates nothing. `options.tables` is what your schema file's `defineJanusTables(…)` returned. |
| `DrizzleAdapter` | The type of what `createDrizzleAdapter` returns. |
| `createDrizzleStores(db, options?)` | The `{ users, sessions, tokens }` that `janus()` takes as `store`. |
| `createDrizzleRelations(db, options?)` | The `RelationStore` that `permissions()` takes as `store`, and `janus()` takes as `relations`. |
| `defineJanusTables(options?)` | The five tables, `{ users, logins, sessions, tokens, relations }`, as Drizzle tables. Export each from a schema file so your migrations create them. |
| `JanusTablesOptions` | `{ schema? }`: a `pgSchema(…)` to put the tables in. Absent, they are in the connection's `search_path`, `public` by default. |
| `DrizzleAdapterOptions` | `{ tables? }`: the tables the stores query. Absent, `defineJanusTables()`. Pass it whenever the tables are in a schema of their own. |
| `JanusTables` | The type of what `defineJanusTables` returns. |

`db` is any Drizzle PostgreSQL instance: `node-postgres`, `postgres.js`,
`bun-sql` or PGlite. A connection string, a raw driver client or a SQLite
Drizzle does not compile.

## What the database holds

The port's records, one column per field. Nothing is encoded, so a row read in
`psql` looks like the record in the code. No name carries a prefix: the
database, or the PostgreSQL schema, is what keeps them apart from your own
tables.

| Table | Keys and indexes |
| --- | --- |
| `users` | `id` · `(id, type)` unique, for the logins' foreign key · `(type, id)` for listing · a check that a password has both its hash and its date, or neither |
| `logins` | primary key `(type, login)`: **a login is unique per user type** · `(user_id, type)` references the user, `on delete cascade` |
| `sessions` | `id` · `token_hash` unique · `user_id` · `expires_at`, for `collectExpired()` |
| `tokens` | `token_hash` · `user_id` · a check on `kind` |
| `relations` | one row per tuple, unique `nulls not distinct` over all six columns, subject first: the index `findObjects` pages · `(object_type, object_id, relation)` for one hop forwards |

`logins` is also a `text[]` on `users`, which the store reads back in order.
PostgreSQL has no unique index over the elements of an array, so the `logins`
table plays that role, written in the same transaction as the user.

Every key column is `text collate "C"`, compared byte for byte as the port
requires. No secret is stored: sessions and tokens hold `sha256` of the secret,
and passwords a self-describing hash.

## Traps

- **Your migrations create the tables, not this package.** The core never
  manages a schema, and the stores create nothing per request. Without the
  exports in your schema file, the first sign-up fails with `STORE_FAILED`,
  caused by `relation "users" does not exist`.
- **Keep all five exports in the schema file.** drizzle-kit writes a
  `DROP TABLE` for a table the schema no longer names.
- **With a PostgreSQL schema, export it, and pass the adapter its tables.**
  drizzle-kit writes `CREATE SCHEMA` only for an exported `pgSchema`. A
  factory not given `{ tables }` queries `public`: if your application has a
  `users` table there, deleting a user through the store deletes from yours.
  `createDrizzleAdapter(db, { tables: janusTables })`, with the object your
  schema file exports.
- **Call `auth.collectExpired()` on a schedule.** PostgreSQL has no TTL, so
  lapsed sessions stay in `sessions` until something deletes them. The
  core still refuses them on every read.
- **A unique violation on anything but a login is a `StoreFailure`, not
  `LOGIN_TAKEN`.** Such a violation is an adapter bug. Reporting it as a taken
  login would tell somebody their e-mail is in use when it is not.
- **A user's write and a relation write of more than one tuple are
  transactions**, through `@nxgt/drizzle`'s `withTransaction`. They are not
  retried for you. A sign-up and a relation write are idempotent, so retry
  them; an update after a timeout answers `VERSION_CONFLICT` if the first
  attempt landed, so read the user again.
- **PostgreSQL stores no NUL character, and a user's fields never hold one.**
  `@nxgt/janus` refuses `\u0000` and a lone surrogate in fields with
  `USER_INVALID`, and answers a login holding one as nobody's, before any
  store is asked.
- **Columns are `snake_case`.** This follows PostgreSQL's own convention and
  `@nxgt/drizzle`'s columns, so hand-written SQL needs no quotes. The records
  the stores return are camelCase, as everywhere in Janus.

## Documentation

- [Guides](docs/README.md): wiring the stores, where the tables live and how to back them up, and the tables in your migrations
- [Troubleshooting](docs/troubleshooting.md): look up the error message you see
- [Roadmap](docs/roadmap.md): what is next, and what is not planned

## Type safety, counted

Six plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case in `test/types/adapter.ts`:
- a connection string instead of a Drizzle instance;
- the driver's client instead of the Drizzle instance over it;
- a Drizzle instance over SQLite;
- a schema's name, `'janus'`, instead of the `pgSchema` the schema file
  exports;
- `{ schema }` given to a factory, instead of the tables built in it;
- the tables given bare, instead of as `{ tables }`.

## Licence

MIT
