# The tables in your migrations

This page covers:
- adding the five tables to the schema drizzle-kit reads;
- what the migration creates;
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

Then generate and apply the migration as usual:

```sh
bunx drizzle-kit generate
bunx drizzle-kit migrate
```

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
	"email_verified_at" timestamp(3) with time zone,
	"version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "users_id_type_unique" UNIQUE("id","type"),
	CONSTRAINT "users_password_whole" CHECK (("password_hash" is null) = ("password_updated_at" is null))
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

With `{ schema: janus }`, it starts with `CREATE SCHEMA "janus"`, and every
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
- **No foreign key from sessions and tokens to users.** Deleting a user
  deletes the user; the core deletes the sessions and tokens next, as it does
  when they live in another store.

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

const [row] = await janusDb
	.select({ patients: count() })
	.from(users)
	.where(eq(users.type, 'patient'));
const patients = row?.patients ?? 0;
```

**Read, never write.** A row written behind the store's back skips its
invariants: the logins' uniqueness, `version`, the password check. Write
through `auth` and `access`.
