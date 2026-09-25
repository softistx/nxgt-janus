# Wiring the stores and the relations

This page covers connecting `@nxgt/janus` to PostgreSQL through Drizzle:
- the three user stores for `janus()`;
- the relation store for `permissions()`;
- what each one throws when the database cannot answer.

Creating the tables is covered in [the migrations page](migrations.md), and
choosing their database in [Where the tables live](database.md).

```ts
import { janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { createDrizzleAdapter } from '@nxgt/janus-drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { z } from 'zod';

// Janus's own database; your application's tables stay on their own instance.
const db = drizzle(process.env.JANUS_DATABASE_URL ?? 'postgres://localhost:5432/janus');

const postgres = createDrizzleAdapter(db); // { store, relations }

export const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	hasher: scryptHasher(),
	...postgres, // deleting a user deletes every tuple naming them
});

export const model = defineModel({
	subjects: auth.types,
	types: {
		document: {
			relations: { owner: ['user'], viewer: ['user'] },
			permissions: { view: ['owner', 'viewer'] },
		},
	},
});

export const access = permissions({ model, store: postgres.relations });
```

## `createDrizzleAdapter(db, options?)`

```ts
import type { PgDatabase } from '@nxgt/drizzle/pg'; // any Drizzle PostgreSQL instance

function createDrizzleAdapter(
	db: PgDatabase,
	options?: { tables?: JanusTables }, // DrizzleAdapterOptions
): DrizzleAdapter; // { store, relations }
```

It returns `createDrizzleStores(db, options)` as `store` and
`createDrizzleRelations(db, options)` as `relations`: the two keys `janus()` takes them under, so a spread wires
both. `permissions()` takes the same relation store as `postgres.relations`.
It connects to nothing and creates nothing.

`options.tables` is what your schema file's `defineJanusTables(…)` returned,
so the stores query the tables your migration created. Leave it out for
tables in the connection's `search_path`, `public` by default. **Pass it
whenever the tables are in a PostgreSQL schema of their own**: without it, the
stores query `public`, where your application may have a `users` of its own
([Where the tables live](database.md#a-schema-of-its-own)).

**Pass the relation store to both.** If only `permissions()` gets it, tuples
are still written, but deleting a user leaves behind every tuple naming them.
The spread makes that impossible to forget. An application that only
authenticates takes `createDrizzleStores(db)` alone, below.

`db` is any Drizzle PostgreSQL instance, whatever its driver:

| Driver | Import |
| --- | --- |
| `pg` (node-postgres) | `drizzle-orm/node-postgres` |
| `postgres` (postgres.js) | `drizzle-orm/postgres-js` |
| Bun's own `SQL` | `drizzle-orm/bun-sql` |
| PGlite, for tests | `drizzle-orm/pglite` |

The adapter's specs run on all four: on PGlite, and on PostgreSQL 17 over each
of the other three, on every CI run.

## `createDrizzleStores(db, options?)`

```ts
function createDrizzleStores(db: PgDatabase, options?: { tables?: Pick<JanusTables, 'users' | 'logins' | 'sessions' | 'tokens'> }): JanusStores; // { users, sessions, tokens }
```

This is what `janus({ store })` takes. It uses `users`, `logins`, `sessions`
and `tokens`.

**Every read is one statement.** An absence comes back as an empty result,
which becomes `null`. Anything that rejects is a failure, so an outage can
never be confused with "no such user".

**Writing a user is one transaction** that covers the user's row and its rows
in `logins`. It runs through `@nxgt/drizzle`'s `withTransaction`, inside
the method; the core never opens one. Every other write is a single
statement. `consumeToken` is one statement, `with before as (select … for update) update … from before`: of
twenty concurrent redemptions of one token, exactly one sees `spentAt: null`.
This is measured on PostgreSQL 17 on every CI run.

Every method of the port is implemented, **including the optional
`deleteExpiredSessions`**. PostgreSQL has no TTL, so
`auth.collectExpired()` is how lapsed sessions leave the table; schedule it.
The [migrations page](migrations.md#collecting-lapsed-sessions) shows how.

## `createDrizzleRelations(db, options?)`

```ts
function createDrizzleRelations(db: PgDatabase, options?: { tables?: Pick<JanusTables, 'relations'> }): RelationStore;
```

This is what `permissions({ store })` takes, and `janus({ relations })`. It
uses `relations`.

**A write of more than one tuple is a transaction**: removals first, then
additions, all or nothing. `grant` and `revoke` write one tuple, in one
statement. A transaction is not retried; a write is idempotent, so retry it
yourself if you want to.

`findObjects` orders ids byte by byte: the columns are `collate "C"`, so the
order does not depend on your database's collation. Under `en-US`, `a` sorts
before `B`. Here `B` comes first, as JavaScript's `<` puts it.

## What a failure looks like

The adapter defines **no error class**. Every rejection is `@nxgt/janus`'s own,
so `instanceof` holds in your code: `@nxgt/janus` is a peer, and there is one
copy of it.

| What PostgreSQL reports | What you get |
| --- | --- |
| A login another user of the type holds | `StoreConflict`, code `LOGIN_TAKEN`, carrying `login` and `userType` |
| A row with this id already there | Nothing: the insert was a retry, and returns what is stored — or `NOT_FOUND` if the user was deleted between the two |
| A unique violation on **any other constraint** | `StoreFailure`: an adapter bug, never reported as a taken login |
| A check or foreign key refusing a row | `StoreFailure`: the core validated the record already, so it is never the caller's fault |
| A NUL character in a field or a login | `StoreFailure`: PostgreSQL stores none — refuse it in your schema |
| Anything else: a refused connection, a timeout, a missing table | `StoreFailure`, with the driver's error as `cause` |

A login is claimed with `on conflict do nothing`, so no conflict is ever told
apart by parsing a driver message. The logins are claimed in sorted order, so
two sign-ups racing for the same ones never deadlock: the second waits, then
gets `LOGIN_TAKEN`.

The `cause` is `@nxgt/drizzle`'s `toDataError(error)`. Over `node-postgres`,
postgres.js and PGlite that is a `DataError`, whose `sqlState`, `table` and
`constraint` say what PostgreSQL refused. Over Bun's `SQL` it is Drizzle's
`DrizzleQueryError`, with PostgreSQL's code as `errno` on its own `cause`.

Nothing returns `null` for an error, so a route answers 503, not 401 or 404:

```ts
import { StoreFailure } from '@nxgt/janus';

export async function me(request: Request): Promise<Response> {
	try {
		const current = await auth.authenticate(request);
		return current === null ? new Response(null, { status: 401 }) : Response.json({ id: current.user.id });
	} catch (error) {
		if (error instanceof StoreFailure) {
			console.error('janus: the database could not answer', error.cause);
			return new Response(null, { status: 503 });
		}
		throw error;
	}
}
```

With `@nxgt/janus-hono`, `app.onError(janusErrors())` does the same for every
route.
