# Where the tables live

This page covers:
- giving Janus **a database of its own**, the recommended setup;
- or **a PostgreSQL schema of its own**, beside your tables in one database;
- backing up and restoring Janus's tables, in either setup.

The five tables are `users`, `logins`, `sessions`, `tokens` and `relations`,
with no prefix. Where they live is the one choice you make:

| | A database of its own | A schema of its own |
| --- | --- | --- |
| The tables | `users`, … in `public` | `janus.users`, … |
| `defineJanusTables(…)` | `defineJanusTables()` | `defineJanusTables({ schema: janus })` |
| The adapter | `createDrizzleAdapter(janusDb)` | `createDrizzleAdapter(db, { tables: janusTables })` |
| Migrations | a drizzle-kit config of its own | your application's drizzle-kit config |
| Back up and restore Janus alone | `pg_dump` / `pg_restore` of the database | `pg_dump -n janus` / `pg_restore -n janus` |
| A foreign key from your tables to `users`, one transaction over both | no | yes |

The core never needs a transaction over your tables and Janus's, and never
reads your tables. Choose a schema of its own only if your own tables must
reference Janus's users, or if you cannot run a second database.

## A database of its own

Janus's tables in `janus`, your application's in `app`: restoring one never
rolls the other back, and each is dumped, restored, moved or sized alone.

### The schema file and its drizzle-kit config

```ts
// src/janus/schema.ts
import { defineJanusTables } from '@nxgt/janus-drizzle';

export const { users, logins, sessions, tokens, relations } = defineJanusTables();
```

```ts
// drizzle.janus.config.ts — beside your application's drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/janus/schema.ts',
	out: './drizzle/janus',
	dbCredentials: { url: process.env.JANUS_DATABASE_URL ?? 'postgres://localhost:5432/janus' },
});
```

Create the database once, then generate and apply Janus's migrations with this
config:

```sh
createdb janus
bunx drizzle-kit generate --config drizzle.janus.config.ts
bunx drizzle-kit migrate --config drizzle.janus.config.ts
```

`drizzle-kit generate` writes `CREATE TABLE "users"`, `"logins"`,
`"sessions"`, `"tokens"` and `"relations"`, with their indexes and the
foreign key from `logins` to `users`.

### A Drizzle instance of its own

```ts
import { createDrizzleAdapter } from '@nxgt/janus-drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';

// Your application's own tables stay on its own instance, over DATABASE_URL.
const janusDb = drizzle(process.env.JANUS_DATABASE_URL ?? 'postgres://localhost:5432/janus');
const postgres = createDrizzleAdapter(janusDb); // { store, relations }
```

Everything else is wired as in [Wiring the stores and the relations](wiring.md).

## A schema of its own

The tables in a PostgreSQL schema named `janus`, in your application's
database, created by your application's migrations.

```ts
// src/db/schema.ts — the file your drizzle.config.ts names as `schema`
import { defineJanusTables } from '@nxgt/janus-drizzle';
import { pgSchema } from 'drizzle-orm/pg-core';

export const janus = pgSchema('janus');
export const { users, logins, sessions, tokens, relations } = defineJanusTables({ schema: janus });

// your own tables below
```

**Export the schema, `janus`, too.** drizzle-kit writes `CREATE SCHEMA
"janus"` only for a schema it finds exported. Without it, the migration
creates `"janus"."users"` in a schema that does not exist, and fails with
`schema "janus" does not exist`.

**Pass the adapter the tables you exported**, so the stores query exactly
what your migration created:

```ts
// src/db/schema.ts
export const janus = pgSchema('janus');
export const janusTables = defineJanusTables({ schema: janus });
export const { users, logins, sessions, tokens, relations } = janusTables;
```

```ts
import { janusTables } from './db/schema';

const postgres = createDrizzleAdapter(db, { tables: janusTables });
```

drizzle-kit ignores `janusTables`, an object and not a table, and creates the
five from the exports below it. `createDrizzleStores(db, { tables })` and
`createDrizzleRelations(db, { tables })` take them the same way.

**Without `{ tables }`, the stores query `users`, `sessions`, … in the
connection's `search_path`: `public`.** If your application has a `users`
table of its own there, deleting a user through the store would delete from
it. Always pass the tables with a schema of its own.

The names in your schema file are yours to choose. If `users` is taken by a
table of your own, rename on export:

```ts
export const janusTables = defineJanusTables({ schema: janus });
export const janusUsers = janusTables.users;
// …and the four others
```

## Backing up and restoring

`pg_dump`'s custom format, `-Fc`, is what `pg_restore` reads. Both setups were
measured on PostgreSQL 17.

### A database of its own

```sh
pg_dump -Fc -f janus.dump janus

# Into the same database, replacing what is there:
pg_restore --clean --if-exists -d janus janus.dump
```

The dump holds drizzle-kit's migration journal too, the `drizzle` schema, so a
restored database knows which migrations it has.

### A schema of its own

```sh
pg_dump -Fc -n janus -f janus.dump app

# Into the same database, replacing Janus's tables and nothing else:
pg_restore --clean -n janus -d app janus.dump
```

`-n janus` dumps the schema and its five tables only: your tables are neither
dumped nor touched by the restore. The migration journal is not in the dump,
since it is your application's.

### What a restore means for your users

A restore brings back the users, logins and relations as they were, and the
sessions and one-time tokens too:
- a session revoked since the dump stands again until it lapses. If that
  matters, `delete from sessions` (or `delete from janus.sessions`) after the
  restore signs everybody out;
- a user created since the dump is gone, with their sign-in;
- a reset link sent since the dump answers `TOKEN_UNKNOWN`.

With sessions in Redis, through `@nxgt/janus-redis`, sessions and tokens are
not in the dump at all, and a restore leaves them as they are.
