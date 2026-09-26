# The tables in your migrations

This page covers:
- adding the five tables to the schema drizzle-kit reads;
- what the migration creates;
- upgrading: the migration a new version of the tables needs;
- collecting lapsed sessions;
- what the database holds.

The core never manages a schema, and the stores create nothing per request.
**Your migrations create the tables**, as they create your own.

## In your schema

`defineJanusTables()` returns the five tables. Export them from the file, or
one of the files, that a drizzle-kit config names as `schema`:

```ts
// src/janus/schema.ts
import { defineJanusTables } from '@nxgt/janus-drizzle';

export const { users, logins, sessions, tokens, relations } = defineJanusTables();
```

Which config, and which database, is the choice
[Where the tables live](database.md) walks through: a database of its own,
with a drizzle-kit config of its own (recommended), or a PostgreSQL schema of
its own, `defineJanusTables({ schema: janus })`, in your application's
schema file.

Then generate and apply the migration with that config:

```sh
bunx drizzle-kit generate --config drizzle.janus.config.ts
bunx drizzle-kit migrate --config drizzle.janus.config.ts
```

With a schema of its own in your application's database, it is your
application's config, so the plain `bunx drizzle-kit generate` and `migrate`.

drizzle-kit only picks up top-level table exports, so export each table: the
object `defineJanusTables()` returns is not itself a table, and drizzle-kit
finds nothing in it. Measured on drizzle-kit 1.0.0-rc.4.

**Keep all five.** drizzle-kit writes a `DROP TABLE` for a table the schema no
longer names, and that drops every user. Read the migration before you apply
it, as with any other.

An application that only authenticates can leave out `relations`, as long as
it never passes `createDrizzleRelations`. `createDrizzleAdapter` needs all
five.

## What the migration creates

It needs **PostgreSQL 15 or later**: the tuple constraint is `unique nulls not
distinct`.

```sql
CREATE TABLE "users" (
	"id" text collate "C" PRIMARY KEY,
	"type" text collate "C" NOT NULL,
	"schema_version" text NOT NULL,
	"active" boolean NOT NULL,
	"fields" jsonb NOT NULL,
	"logins" text[] NOT NULL,
	"password_hash" text,
	"password_updated_at" timestamp(3) with time zone,
	"second_factor_method" text,
	"second_factor_secret" text,
	"second_factor_confirmed_at" timestamp(3) with time zone,
	"second_factor_last_step" integer,
	"email_verified_at" timestamp(3) with time zone,
	"version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "users_id_type_unique" UNIQUE("id","type"),
	CONSTRAINT "users_password_whole" CHECK (("password_hash" is null) = ("password_updated_at" is null)),
	CONSTRAINT "users_second_factor_whole" CHECK (("second_factor_method" is null) = ("second_factor_secret" is null) and ("second_factor_method" is not null or ("second_factor_confirmed_at" is null and "second_factor_last_step" is null)))
);
CREATE TABLE "logins" (
	"type" text collate "C",
	"login" text collate "C",
	"user_id" text collate "C" NOT NULL,
	CONSTRAINT "logins_pkey" PRIMARY KEY("type","login")
);
-- sessions, tokens, relations, the indexes, and the foreign key from
-- logins to users, on delete cascade.
```

With `defineJanusTables({ schema: janus })`, it starts with `CREATE SCHEMA "janus"`, and every
name is qualified: `CREATE TABLE "janus"."users"`.

The specs build their database from exactly this: drizzle-kit's own
`generateMigration` over the exported tables, in both layouts. So what your
migration creates is what the conformance suites ran on.

### The choices in it

- **No prefix.** In a database of its own, nothing can collide; beside your
  tables, a PostgreSQL schema keeps them apart, and `pg_dump -n janus` backs
  them up alone. A prefix would do neither.
- **`snake_case` columns.** This follows PostgreSQL's catalog and
  `@nxgt/drizzle`'s `timestamps()`, so a query written by hand needs no quotes.
  The records the stores return are camelCase.
- **`text collate "C"` for every key.** The port compares ids, logins and
  types byte for byte. Under a database collation such as `en-US`, `B` sorts
  after `a`, and a page in ascending id order repeats or skips rows.
- **`text`, not `uuid`, for ids.** The core mints UUIDv7s, but a `uuid` column
  would refuse any other id with an error rather than find nothing, and would
  return a different spelling than the one written.
- **`timestamp(3)`.** A JavaScript `Date` has milliseconds. At PostgreSQL's
  default of microseconds, a date written and read back is not the one the
  core wrote.
- **`jsonb` for `fields`.** The core validated them against your schema. Keys
  come back in `jsonb`'s own order; values are unchanged.
- **Logins twice.** They are stored as the `logins` array on the user,
  returned verbatim and in order, and as rows in `logins`, whose primary
  key is the per-type uniqueness. PostgreSQL has no unique index over the
  elements of an array.
- **A second factor in four columns, checked whole.** A method and a secret,
  or neither; a confirmation date and a last step only beside them. The
  secret is sealed by `@nxgt/janus` before the store sees it, so a dump of
  `users` cannot produce a code.
- **`attempts` is `not null default 0`**, so the rows an upgrade finds read
  as tokens nobody has guessed at yet.
- **No foreign key from sessions and tokens to users.** Deleting a user
  deletes the user; the core deletes the sessions and tokens next, as it does
  when they live in another store.

## Upgrading

A new version of the tables is a migration, like a change to your own. Run
`drizzle-kit generate` after upgrading the package, read what it wrote, and
migrate **before** deploying the code that reads the new columns:

```sh
bun add @nxgt/janus-drizzle@latest @nxgt/janus@latest
bunx drizzle-kit generate --config drizzle.janus.config.ts
bunx drizzle-kit migrate --config drizzle.janus.config.ts
```

Deployed first, every query on `users` or `tokens` fails with `STORE_FAILED`,
caused by `column "…" does not exist`.

### To 0.2: the second factor and attempts

Every column is added nullable or with a default, so the migration rewrites
no row and existing users read as having no second factor:

```sql
ALTER TABLE "users" ADD COLUMN "second_factor_method" text;
ALTER TABLE "users" ADD COLUMN "second_factor_secret" text;
ALTER TABLE "users" ADD COLUMN "second_factor_confirmed_at" timestamp(3) with time zone;
ALTER TABLE "users" ADD COLUMN "second_factor_last_step" integer;
ALTER TABLE "tokens" ADD COLUMN "code_hash" text;
ALTER TABLE "tokens" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_second_factor_whole" CHECK (…);
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_kind", ADD CONSTRAINT "tokens_kind" CHECK ("kind" in ('verifyEmail', 'resetPassword', 'secondFactor', 'signInCode'));
```

That is what drizzle-kit writes from the 0.1 tables to the 0.2 ones; with a
PostgreSQL schema of its own, every name is qualified.

## Collecting lapsed sessions

PostgreSQL has no TTL. A lapsed session is refused on every read, but it stays
in `sessions` until something deletes it. `auth.collectExpired()`
deletes every session whose `expiresAt` has passed, and returns how many:

```ts
// Hourly, from whatever runs your scheduled jobs.
const collected = await auth.collectExpired();
console.info(`janus: ${collected} lapsed sessions deleted`);
```

`expires_at` is indexed, so this is one indexed `delete`. Spent and lapsed
one-time tokens stay until their user is deleted; there are few of them per
user.

## Reading the tables yourself

The tables your schema file exports are ordinary Drizzle tables, for a query
of your own: an admin listing, a report, a data export.

```ts
import { count, eq } from 'drizzle-orm';
import { users } from './janus/schema';

// janusDb: the Drizzle instance over Janus's tables
const [row] = await janusDb
	.select({ patients: count() })
	.from(users)
	.where(eq(users.type, 'patient'));
const patients = row?.patients ?? 0;
```

**Read, never write.** A row written behind the store's back skips its
invariants: the logins' uniqueness, `version`, the password check, the
sealing of a second factor's secret. Write
through `auth` and `access`.
