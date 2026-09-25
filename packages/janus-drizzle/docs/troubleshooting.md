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
| A row with this id already there | Nothing: the insert was a retry, and returns what is stored — or `NOT_FOUND` if the user was deleted between the two |
| A unique violation on any other constraint | `STORE_FAILED` |
| A check or foreign key refusing a row | `STORE_FAILED` |
| A NUL character (`\u0000`) in a field or a login | `STORE_FAILED`: PostgreSQL stores none |
| Anything else | `STORE_FAILED`, with the driver's error as `cause` (see below) |

## Index

**Install and types**
- [`TS2834: Relative import paths need explicit file extensions …`](#ts2834-relative-import-paths-need-explicit-file-extensions-in-ecmascript-imports-when---moduleresolution-is-node16-or-nodenext)
- [`TS2345: Argument of type '…' is not assignable to parameter of type 'PgDatabase'.`](#ts2345-argument-of-type--is-not-assignable-to-parameter-of-type-pgdatabase)
- [`TS2322: Type 'string' is not assignable to type 'PgSchema<string>'.`](#ts2322-type-string-is-not-assignable-to-type-pgschemastring)
- [`TS2353: Object literal may only specify known properties, and 'schema' does not exist in type 'DrizzleAdapterOptions<…>'.`](#ts2353-object-literal-may-only-specify-known-properties-and-schema-does-not-exist-in-type-drizzleadapteroptions)
- [`error instanceof StoreFailure` is `false` for an outage](#error-instanceof-storefailure-is-false-for-an-outage)

**Setup**
- [`STORE_FAILED` caused by `relation "users" does not exist`](#store_failed-caused-by-relation-users-does-not-exist)
- [`STORE_FAILED` caused by `column "type" does not exist`](#store_failed-caused-by-column-type-does-not-exist)
- [`schema "janus" does not exist` while migrating](#schema-janus-does-not-exist-while-migrating)
- [`syntax error at or near "NULLS"` while migrating](#syntax-error-at-or-near-nulls-while-migrating)
- [The migration drops Janus's tables](#the-migration-drops-januss-tables)

**Runtime**
- [`STORE_FAILED`: `<slot>.<operation>: the store could not answer`](#store_failed-slotoperation-the-store-could-not-answer)
- [`LOGIN_TAKEN`: `<operation>: the login "<login>" is taken by another <type>`](#login_taken-operation-the-login-login-is-taken-by-another-type)
- [`NOT_FOUND` / `VERSION_CONFLICT`: `updateUser: …`](#not_found--version_conflict-updateuser-)
- [The `sessions` table keeps growing](#the-sessions-table-keeps-growing)
- [`NOT_FOUND`: `insertUser: the user was deleted meanwhile`](#not_found-insertuser-the-user-was-deleted-meanwhile)
- [`STORE_FAILED` for a sign-up whose fields hold `\u0000`](#store_failed-for-a-sign-up-whose-fields-hold-u0000)

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
over SQLite.

**Why:** the adapter takes a Drizzle PostgreSQL instance and connects to
nothing itself.

**Fix:** wrap the client with Drizzle's PostgreSQL `drizzle()` for its driver.

```ts
import { drizzle } from 'drizzle-orm/node-postgres';

const postgres = createDrizzleAdapter(
	drizzle(process.env.DATABASE_URL ?? 'postgres://localhost:5432/app'),
);
```

### `TS2322: Type 'string' is not assignable to type 'PgSchema<string>'.`

**When:** `defineJanusTables({ schema: 'janus' })`.

**Why:** `schema` is the `pgSchema(…)` itself, which your schema file must
export anyway: drizzle-kit writes `CREATE SCHEMA` only for an exported one.

**Fix:**

```ts
export const janus = pgSchema('janus');
export const janusTables = defineJanusTables({ schema: janus });
```

### `TS2353: Object literal may only specify known properties, and 'schema' does not exist in type 'DrizzleAdapterOptions<…>'.`

**When:** `createDrizzleAdapter(db, { schema: janus })`, or the same given to
`createDrizzleStores` or `createDrizzleRelations`.

**Why:** the factories take the tables themselves, not how to build them, so
the stores query exactly the tables your migration created.

**Fix:** pass the object your schema file exports.

```ts
createDrizzleAdapter(db, { tables: janusTables });
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

### `STORE_FAILED` caused by `relation "users" does not exist`

The code is `42P01`: `sqlState` on the `DataError` in `cause`, or `errno`
under it over Bun's `SQL`. It can name `logins`, `sessions`, `tokens` or
`relations` just as well, or `janus.users` and the like.

**When:** the first call that reaches the database: a sign-up, a sign-in, a
`can()`.

**Why:** one of two things.
- Your migrations never created the tables. The core never manages a schema,
  and neither do the stores.
- They did, in a PostgreSQL schema, and the factory was not given
  `{ tables }`: it queries `users` in the connection's `search_path`, not
  `janus.users`.
  Or the Drizzle instance is connected to your application's database while
  the tables are in Janus's own.

**Fix:** export the five tables from a drizzle-kit schema file, then generate
and apply a migration.

```ts
// src/janus/schema.ts
import { defineJanusTables } from '@nxgt/janus-drizzle';

export const { users, logins, sessions, tokens, relations } = defineJanusTables();
```

```sh
# With a database of its own, name its config; with a schema of its own, it is your application's.
bunx drizzle-kit generate --config drizzle.janus.config.ts
bunx drizzle-kit migrate --config drizzle.janus.config.ts
```

drizzle-kit reads top-level table exports only: exporting the object
`defineJanusTables()` returns, whole, creates nothing.

With a PostgreSQL schema, pass the adapter the tables built in it:

```ts
createDrizzleAdapter(db, { tables: janusTables }); // from the schema file
```

### `STORE_FAILED` caused by `column "type" does not exist`

Also `column "type" of relation "users" does not exist`, or another column of
Janus's tables. The code is `42703`.

**When:** the tables are in a PostgreSQL schema of their own, and your
application has a `users` (or `sessions`, …) table of its own in `public`.

**Why:** the factory was not given `{ tables }`, so it queries `public.users`:
your table, not Janus's. Reads fail on its columns. **A delete can succeed**,
and delete from your table.

**Fix:** pass the tables your schema file exports, and check your own tables
for rows deleted meanwhile.

```ts
createDrizzleAdapter(db, { tables: janusTables });
```

### `schema "janus" does not exist` while migrating

The code is `3F000`. `janus` is the name your `pgSchema(…)` gives.

**When:** applying the migration that creates `"janus"."users"`.

**Why:** the schema file passes `pgSchema('janus')` to `defineJanusTables`
without exporting it. drizzle-kit writes `CREATE SCHEMA` only for a schema it
finds exported, so the migration creates tables in a schema that does not
exist.

**Fix:** export it, and generate the migration again.

```ts
export const janus = pgSchema('janus');
export const janusTables = defineJanusTables({ schema: janus });
export const { users, logins, sessions, tokens, relations } = janusTables;
```

### `syntax error at or near "NULLS"` while migrating

**When:** applying the migration that creates `relations`.

**Why:** the tuple constraint is `UNIQUE NULLS NOT DISTINCT`, which PostgreSQL
accepts from version 15. Before that, two rows for one entity (whose
`subject_relation` is `null`) would not collide, and a tuple could be stored
twice.

**Fix:** run PostgreSQL 15 or later. An application that only authenticates
can leave `relations` out of its schema file, and then never passes
`createDrizzleRelations`.

### The migration drops Janus's tables

**When:** `drizzle-kit generate` writes `DROP TABLE "users"` (or another of
the five) into a migration.

**Why:** the schema no longer exports that table: an export was removed, or
the schema file moved out of the drizzle-kit config's `schema`. drizzle-kit
drops what the schema no longer names.

**Fix:** delete that migration before applying it, and export all five tables
again. Applied, it deletes every user.

---

## Runtime

### `STORE_FAILED`: `<slot>.<operation>: the store could not answer`

**When:** any call, for as long as the database cannot answer: a refused
connection, a timeout, a failover, a missing table, a permission denied.

**Why:** the adapter never turns a failure into an absence. An outage is not
"no such user".

**Fix:** answer 503 and let the client retry; log `cause` for the details.

```ts
import { StoreFailure } from '@nxgt/janus';

if (error instanceof StoreFailure) {
	console.error(error.slot, error.operation, error.cause);
}
```

What `cause` is depends on the driver. Over `node-postgres`, postgres.js and
PGlite it is `@nxgt/drizzle`'s `DataError`, whose `sqlState` is PostgreSQL's
code — `42P01`, `57P01`. Over Bun's `SQL` it is Drizzle's `DrizzleQueryError`:
Bun reports the code as `errno`, which `@nxgt/drizzle` does not read yet, so
the code is `error.cause.cause.errno`.

`slot` is `users`, `sessions`, `tokens` or `relations`; `operation` is the port
method.

### `LOGIN_TAKEN`: `<operation>: the login "<login>" is taken by another <type>`

**When:** a sign-up, or an update that changes a login, with a login another
user of the same type holds.

**Why:** a login is unique per user type, by the `logins` table's primary key. The
same e-mail may hold a patient and a staff user.

**Fix:** tell the user the login is taken. `error.login` and `error.userType`
name it. `@nxgt/janus-hono` answers it 409.

### `NOT_FOUND` / `VERSION_CONFLICT`: `updateUser: …`

**When:** `update`, `setActive`, `setPassword` or `changePassword` races another
write or a deletion.

**Why:** every user write is conditional on the version just read. Nothing was
written.

**Fix:** read the user again and retry, or tell the user it changed meanwhile.

### The `sessions` table keeps growing

**When:** rows whose `expires_at` has passed are never deleted.

**Why:** PostgreSQL has no TTL. The core refuses a lapsed session on every
read, but deleting it is `auth.collectExpired()`'s job.

**Fix:** schedule it.

```ts
const collected = await auth.collectExpired(); // hourly
```

### `NOT_FOUND`: `insertUser: the user was deleted meanwhile`

**When:** a sign-up or `create` is retried after a timeout, and the user its
first attempt stored was deleted before the retry read it back.

**Why:** the retry found a row with its id already there, which makes it a
retry, and then found no user to return. Nothing was written by the retry.

**Fix:** treat it as the deletion it raced: the user is gone. Sign up again
if that is what the caller wants.

### `STORE_FAILED` for a sign-up whose fields hold `\u0000`

The code is `22P05` for a field (`jsonb`) and `22021` for a login (`text`);
a lone UTF-16 surrogate in a field gives `22P02`.

**When:** a sign-up, `create` or `update` whose fields or login contain a NUL
character, which your schema accepted.

**Why:** PostgreSQL stores no NUL in `text` or `jsonb`. The record reaches the
store valid, and the store cannot write it: that is reported as a failure,
never as the caller's fault, because the store cannot tell. MongoDB and the
memory store keep it.

**Fix:** refuse it in your schema, so the caller gets `USER_INVALID`, a 400:

```ts
const noNul = z.string().refine((value) => !value.includes('\u0000'), 'no NUL character');

const User = z.strictObject({ email: z.email(), name: noNul });
```
