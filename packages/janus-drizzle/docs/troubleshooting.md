# Troubleshooting `@nxgt/janus-drizzle`

Each entry is headed by the text you see: a compiler error, a message, or an
error `code`. Search this page for the words of your message.

This adapter **defines no error class**. Every error it throws is one of
`@nxgt/janus`'s: `StoreFailure`, `StoreConflict` or `NotFoundError`. So the
codes, and the response each one deserves, are those of the core. The errors
the core raises itself (`CREDENTIALS_INVALID`, `TOKEN_EXPIRED`,
`PERMISSION_DEPTH`, …) are in
[`@nxgt/janus`'s troubleshooting](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md).

How PostgreSQL's errors become the port's:

| What PostgreSQL reports | What you get |
| --- | --- |
| A login another user of the type holds | `LOGIN_TAKEN`, naming the login and the user type |
| A row with this id already there | Nothing: the insert was a retry, and returns what is stored |
| A unique violation on any other constraint | `STORE_FAILED` |
| A check or foreign key refusing a row | `STORE_FAILED` |
| Anything else | `STORE_FAILED`, with `@nxgt/drizzle`'s `DataError` as `cause` |

## Index

**Install and types**
- [`TS2834: Relative import paths need explicit file extensions …`](#ts2834-relative-import-paths-need-explicit-file-extensions-in-ecmascript-imports-when---moduleresolution-is-node16-or-nodenext)
- [`TS2345: Argument of type '…' is not assignable to parameter of type 'PgDatabase'.`](#ts2345-argument-of-type--is-not-assignable-to-parameter-of-type-pgdatabase)
- [`error instanceof StoreFailure` is `false` for an outage](#error-instanceof-storefailure-is-false-for-an-outage)

**Setup**
- [`STORE_FAILED` caused by `relation "janus_users" does not exist`](#store_failed-caused-by-relation-janus_users-does-not-exist)
- [`syntax error at or near "NULLS"` while migrating](#syntax-error-at-or-near-nulls-while-migrating)
- [The migration drops `janus_*` tables](#the-migration-drops-janus_-tables)

**Runtime**
- [`STORE_FAILED`: `<slot>.<operation>: the store could not answer`](#store_failed-slotoperation-the-store-could-not-answer)
- [`LOGIN_TAKEN`: `<operation>: the login "<login>" is taken by another <type>`](#login_taken-operation-the-login-login-is-taken-by-another-type)
- [`NOT_FOUND` / `VERSION_CONFLICT`: `updateUser: …`](#not_found--version_conflict-updateuser-)
- [`janus_sessions` keeps growing](#janus_sessions-keeps-growing)
- [`TypeError: db.execute answered no rows`](#typeerror-dbexecute-answered-no-rows)

---

## Install and types

### `TS2834: Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'.`

With `skipLibCheck: true`, the same cause shows up instead as
`TS2305: Module '"@nxgt/janus-drizzle"' has no exported member '<name>'.`

**When:** you type-check with `"moduleResolution": "node16"` or `"nodenext"`.

**Why:** the declarations import without extensions, the way Bun and every
bundler resolve them. `nodenext` is not supported, as with `@nxgt/janus`.

**Fix:** use the bundler resolution.

```json
{ "compilerOptions": { "module": "preserve", "moduleResolution": "bundler" } }
```

### `TS2345: Argument of type '…' is not assignable to parameter of type 'PgDatabase'.`

`'…'` is `'string'` for a connection string, or the client's type.

**When:** you pass `createDrizzleAdapter` a connection string, the driver's own
client (a `pg` `Pool`, a `postgres()` sql, a `PGlite`), or a Drizzle instance
over SQLite or MySQL.

**Why:** the adapter takes a Drizzle PostgreSQL instance and connects to
nothing itself.

**Fix:** wrap the client with Drizzle's PostgreSQL `drizzle()` for its driver.

```ts
import { drizzle } from 'drizzle-orm/node-postgres';

const postgres = createDrizzleAdapter(drizzle(process.env.DATABASE_URL));
```

### `error instanceof StoreFailure` is `false` for an outage

**When:** an outage rejects with an error whose `code` is `'STORE_FAILED'`,
yet `instanceof StoreFailure` is `false` in your code.

**Why:** two copies of `@nxgt/janus` are installed: the one you import, and
another under this adapter. `@nxgt/janus` is a peer so that there is one copy.

**Fix:** keep one copy. `bun pm ls | grep @nxgt/janus` should print one
version. Align the version you depend on with the adapter's peer range.

---

## Setup

### `STORE_FAILED` caused by `relation "janus_users" does not exist`

The `cause` is a `DataError` with `sqlState: '42P01'`. It can name
`janus_logins`, `janus_sessions`, `janus_tokens` or `janus_relations` just as
well.

**When:** the first call that reaches the database: a sign-up, a sign-in, a
`can()`.

**Why:** your migrations never created the tables. The core never manages a
schema, and neither do the stores.

**Fix:** export the five tables from your drizzle-kit schema, then generate and
apply a migration.

```ts
// src/db/schema.ts
export {
	janusLogins,
	janusRelations,
	janusSessions,
	janusTokens,
	janusUsers,
} from '@nxgt/janus-drizzle';
```

```sh
bunx drizzle-kit generate && bunx drizzle-kit migrate
```

`export * from '@nxgt/janus-drizzle'` works too. Exporting `janusTables` alone
does not: drizzle-kit reads top-level table exports only, and finds none in an
object.

### `syntax error at or near "NULLS"` while migrating

**When:** applying the migration that creates `janus_relations`.

**Why:** the tuple constraint is `UNIQUE NULLS NOT DISTINCT`, which PostgreSQL
accepts from version 15. Before that, two rows for one entity (whose
`subject_relation` is `null`) would not collide, and a tuple could be stored
twice.

**Fix:** run PostgreSQL 15 or later. An application that only authenticates
can leave `janusRelations` out of its schema, and then never passes
`createDrizzleRelations`.

### The migration drops `janus_*` tables

**When:** `drizzle-kit generate` writes `DROP TABLE "janus_users"` (or another
`janus_*` table) into a migration.

**Why:** the schema no longer exports that table: an import was removed, or
the schema file moved out of `drizzle.config.ts`'s `schema`. drizzle-kit drops
what the schema no longer names.

**Fix:** delete that migration before applying it, and export all five tables
again. Applied, it deletes every user.

---

## Runtime

### `STORE_FAILED`: `<slot>.<operation>: the store could not answer`

**When:** any call, for as long as the database cannot answer: a refused
connection, a timeout, a failover, a missing table, a permission denied.

**Why:** the adapter never turns a failure into an absence. An outage is not
"no such user".

**Fix:** answer 503 and let the client retry; read `cause` for the details.

```ts
import { DataError } from '@nxgt/drizzle';
import { StoreFailure } from '@nxgt/janus';

if (error instanceof StoreFailure && error.cause instanceof DataError) {
	console.error(error.slot, error.operation, error.cause.sqlState, error.cause.message);
}
```

`slot` is `users`, `sessions`, `tokens` or `relations`; `operation` is the port
method.

### `LOGIN_TAKEN`: `<operation>: the login "<login>" is taken by another <type>`

**When:** a sign-up, or an update that changes a login, with a login another
user of the same type holds.

**Why:** a login is unique per user type, by `janus_logins`' primary key. The
same e-mail may hold a patient and a staff user.

**Fix:** tell the user the login is taken. `error.login` and `error.userType`
name it. `@nxgt/janus-hono` answers it 409.

### `NOT_FOUND` / `VERSION_CONFLICT`: `updateUser: …`

**When:** `update`, `setActive`, `setPassword` or `changePassword` races another
write or a deletion.

**Why:** every user write is conditional on the version just read. Nothing was
written.

**Fix:** read the user again and retry, or tell the user it changed meanwhile.

### `janus_sessions` keeps growing

**When:** rows whose `expires_at` has passed are never deleted.

**Why:** PostgreSQL has no TTL. The core refuses a lapsed session on every
read, but deleting it is `auth.collectExpired()`'s job.

**Fix:** schedule it.

```ts
const collected = await auth.collectExpired(); // hourly
```

### `TypeError: db.execute answered no rows`

**When:** `consumeToken` (resetting a password, verifying an e-mail) with a
Drizzle driver whose `execute` returns neither an array nor `{ rows }`.

**Why:** `consumeToken` is one raw statement, read through `db.execute`, and
drivers shape that result differently: an array for postgres.js and Bun's
`SQL`, `{ rows }` for `pg` and PGlite.

**Fix:** use one of those four drivers, and
[open an issue](https://github.com/softistx/nxgt-janus/issues) naming yours.
