# The tables in your migrations

This page covers:
- adding the five tables to the schema drizzle-kit reads;
- what the migration creates;
- collecting lapsed sessions;
- what the database holds.

The core never manages a schema, and the stores create nothing per request.
**Your migrations create the tables**, as they create your own.

## In your schema

Export the five tables from the file, or one of the files, that your
`drizzle.config.ts` names as `schema`:

```ts
// src/db/schema.ts
import { pgTable } from 'drizzle-orm/pg-core';

export {
	janusLogins,
	janusRelations,
	janusSessions,
	janusTokens,
	janusUsers,
} from '@nxgt/janus-drizzle';

export const invoices = pgTable('invoices', { /* your own tables */ });
```

Then generate and apply the migration as usual:

```sh
bunx drizzle-kit generate
bunx drizzle-kit migrate
```

drizzle-kit only picks up top-level table exports. `export * from
'@nxgt/janus-drizzle'` works too, but `janusTables` alone does not: it is one
object, and drizzle-kit finds no table in it. Measured on drizzle-kit
1.0.0-rc.4.

**Keep all five.** drizzle-kit writes a `DROP TABLE` for a table the schema no
longer names, and that drops every user. Read the migration before you apply
it, as with any other.

An application that only authenticates can leave out `janusRelations`, as long
as it never passes `createDrizzleRelations`. `createDrizzleAdapter` needs all
five.

## What the migration creates

It needs **PostgreSQL 15 or later**: the tuple constraint is `unique nulls not
distinct`.

```sql
CREATE TABLE "janus_users" (
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
	CONSTRAINT "janus_users_id_type_unique" UNIQUE("id","type"),
	CONSTRAINT "janus_users_password_whole" CHECK (("password_hash" is null) = ("password_updated_at" is null))
);
CREATE TABLE "janus_logins" (
	"type" text collate "C",
	"login" text collate "C",
	"user_id" text collate "C" NOT NULL,
	CONSTRAINT "janus_logins_pkey" PRIMARY KEY("type","login")
);
-- janus_sessions, janus_tokens, janus_relations, the indexes, and the
-- foreign key from janus_logins to janus_users, on delete cascade.
```

The specs build their database from exactly this: drizzle-kit's own
`generateMigration` over the exported tables. So what your migration creates
is what the conformance suites ran on.

### The choices in it

- **`janus_` in front of every name.** None collides with an application's own
  `users` or `sessions`.
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
  returned verbatim and in order, and as rows in `janus_logins`, whose primary
  key is the per-type uniqueness. PostgreSQL has no unique index over the
  elements of an array.
- **No foreign key from sessions and tokens to users.** Deleting a user
  deletes the user; the core deletes the sessions and tokens next, as it does
  when they live in another store.

## Collecting lapsed sessions

PostgreSQL has no TTL. A lapsed session is refused on every read, but it stays
in `janus_sessions` until something deletes it. `auth.collectExpired()`
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

`janusTables` holds the five tables, for a query of your own: an admin
listing, a report, a data export.

```ts
import { janusTables } from '@nxgt/janus-drizzle';
import { count, eq } from 'drizzle-orm';

const [row] = await db
	.select({ patients: count() })
	.from(janusTables.janusUsers)
	.where(eq(janusTables.janusUsers.type, 'patient'));
const patients = row?.patients ?? 0;
```

**Read, never write.** A row written behind the store's back skips its
invariants: the logins' uniqueness, `version`, the password check. Write
through `auth` and `access`.
