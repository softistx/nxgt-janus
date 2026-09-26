# Users — `janus()`

This page is for wiring `janus()` and managing users with it: the
configuration, one or several user types, and every method a user type
answers. It is the **identities** side, usable alone: nothing here needs
[permissions](permissions.md), and `@nxgt/janus` loads none of their code. Sessions have [their own page](sessions.md), and so do the
[e-mail flows](email-flows.md) and [password hashing](passwords.md).

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';

const User = z.object({ email: z.email(), name: z.string() });

export const auth = janus({
	user: User,
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const { user, session, token } = await auth.signUp({
	email: 'ada@example.com',
	name: 'Ada Lovelace',
	password: 'correct horse',
});
user.email;        // the schema's own field, at the top level
user.type;         // 'user'
session.expiresAt; // Date
token;             // handed back once: the store holds only its sha256
```

`createMemoryStores()` is the reference store, for tests and for trying the
package. In production, pass an adapter's stores, such as
`createMongoStores(db)` from `@nxgt/janus-mongo`.

```ts
function janus<const C extends JanusConfig>(config: C & Checked<C>): Janus<C>;
```

`janus()` is **synchronous and does no I/O**. It checks that every store
answers every method of the port, and connects to nothing. A configuration it
cannot use is refused with a bare `TypeError` at that call, before any request
arrives.

## What a user is

A user is **your schema's fields at the top level**, plus what `janus` sets:

```ts
interface UserBase<Type extends string = string> {
	readonly id: Id;               // a UUIDv7 the core minted
	readonly type: Type;           // 'user', or the name you gave the type
	readonly emailVerified: boolean;
	readonly active: boolean;
	readonly hasPassword: boolean; // the hash itself never reaches a user
	readonly hasSecondFactor: boolean; // an active second factor: signIn asks for a code
	readonly version: number;      // one more on every write
	readonly createdAt: Date;
	readonly updatedAt: Date;
}
type User<Type extends string = string, Fields = object> = Readonly<Fields> & UserBase<Type>;
```

A schema that declares one of those keys, or `password`, is refused at compile
time. A schema is any [Standard Schema](https://standardschema.dev) (Zod 4,
Valibot, ArkType), and its output must be JSON: a schema that produces a
`Date` is refused at compile time, because a `Date` round-trips through one
database and not the next. An optional field left `undefined` is dropped
before the store sees it. A string or a key holding a NUL character (`\u0000`)
or a lone surrogate is refused with `USER_INVALID`, on every adapter: PostgreSQL
keeps neither, so janus refuses them everywhere rather than fail on one. So is
a login your own `password.normalize` function turns into one — a `slice`
that cuts an emoji in half, say.

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `user` | Standard Schema | — | One user type, named `'user'`. Exactly one of `user` and `users` |
| `users` | `{ [type]: UserTypeConfig }` | — | Several user types. See [Several user types](#several-user-types) |
| `password.login` | a field name | — | The field users sign in with: a **top-level, required string** field. A typo is a compile error |
| `password.normalize` | `'none' \| 'lowercase' \| 'lowercaseTrim' \| 'nfkcLowercaseTrim' \| (value) => string` | `'lowercaseTrim'` | Applied to the login before any store sees it, at sign-up and at sign-in alike |
| `password.minLength` | integer ≥ 1 | `8` | Below it: `PASSWORD_TOO_SHORT` |
| `email` | a field name | `'email'` | The field `verifyEmail` and `resetPassword` send to. Without one, those flows are absent from the type |
| `session.lifespan` | `Duration` | `'7d'` | How long a session lives |
| `session.renewAfter` | `Duration \| false` | `'1d'` | When `authenticate` slides the session. `false` for a fixed lifespan |
| `schemaVersion` | string | `'1'` | Recorded on every user written. Bump it when the schema tightens |
| `store` | `JanusStores` | — | Required. `createMemoryStores()` or an adapter's |
| `relations` | `RelationStore` | — | The permission store. Wired here, deleting a user deletes every tuple naming them |
| `hasher` | `PasswordHasher` | — | Required as soon as a type has a password. No silent fallback |
| `verifiers` | `PasswordHasher[]` | `[]` | Hashers that only verify: those older hashes were written with |
| `clock` | `Clock` | `systemClock` | `fixedClock()` in tests |
| `cookie` | `CookieConfig` | strict | See [sessions](sessions.md#the-cookie) |
| `tokens.verifyEmail` | `Duration` | `'24h'` | How long a verification token lives |
| `tokens.resetPassword` | `Duration` | `'1h'` | How long a reset token lives |
| `secondFactor` | `{ issuer, keys, challenge? }` | none | A TOTP second factor for every type with a password. Changes what `signIn` answers — see [the second factor](second-factor.md#configuration) |

A `Duration` is `'500ms'`, `'30s'`, `'15m'`, `'8h'`, `'7d'`, or a number of
milliseconds.

### `password.login` is checked at compile time

```ts
janus({
	user: z.object({ email: z.email(), nickname: z.string().optional() }),
	// @ts-expect-error — on login: '"emial" is not a required string field; name one of' 'email'
	password: { login: 'emial' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});
```

`nickname` is not offered either: a login read from an optional field is a user
who may have no way to sign in.

### `password.normalize`

```ts
janus({
	user: z.object({ username: z.string() }),
	password: { login: 'username', normalize: 'none' }, // 'Grace' and 'grace' are two users
	store: createMemoryStores(),
	hasher: scryptHasher(),
});
```

A function is accepted, and must be deterministic: the same rule normalises
at sign-up and at sign-in. An e-mail used by the e-mail flows is always
compared lower-cased and trimmed, whatever the login's rule.

## Several user types

```ts
const Patient = z.object({ email: z.email(), birthDate: z.string() });
const Staff = z.object({ username: z.string(), service: z.string() });

export const clinic = janus({
	users: {
		patient: { schema: Patient, password: { login: 'email' } },
		staff: {
			schema: Staff,
			password: { login: 'username', normalize: 'none', minLength: 12 },
			session: { lifespan: '8h', renewAfter: false },
		},
	},
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

await clinic.patient.signUp({ email: 'p@example.com', birthDate: '1990-01-01', password: 'correct horse' });
await clinic.staff.signIn({ username: 'grace', password: 'a long passphrase' });
clinic.types; // readonly ('patient' | 'staff')[]

const current = await clinic.authenticate(request);
if (current?.user.type === 'staff') current.user.service; // narrowed by type
```

Each type carries `schema` and, optionally, `password`, `email`, `session`
and `schemaVersion`, with the defaults above. A login is unique **per type**:
the same e-mail may hold a patient user and a staff user. A type name is
camelCase, and may not be one of `janus()`'s own methods (`authenticate`,
`signOut`, `signOutEverywhere`, `findUser`, `getUser`, `cookie`,
`collectExpired`, `types`) — a compile error, and a `TypeError` for a
JavaScript caller.

## What each user type answers

In the one-type form these are on `auth` itself; with several types, on
`clinic.patient`, `clinic.staff`.

| Method | Answers | Rejects with |
| --- | --- | --- |
| `create(fields & { password?, active? })` | the user; no session | `USER_INVALID`, `PASSWORD_TOO_SHORT`, `LOGIN_TAKEN` |
| `find(id)` | the user, or `null` — for a malformed id, an unknown one, or one of another type | |
| `get(id)` | the user | `NOT_FOUND` |
| `list({ after?, limit? })` | `CursorPage<User>`, in creation order | `INVALID_CURSOR` |
| `update(user, patch, { ifVersion? })` | the user as written | `USER_INVALID`, `LOGIN_TAKEN`, `VERSION_CONFLICT`, `NOT_FOUND` |
| `setActive(user, active, { ifVersion? })` | the user as written | `VERSION_CONFLICT`, `NOT_FOUND` |
| `delete(user)` | `true`, or `false` for an unknown id or one of another type | |

With a `password`, besides:

| Method | Answers | Rejects with |
| --- | --- | --- |
| `signUp(fields & { password })` | `{ status: 'signedIn', user, session, token }` | `USER_INVALID`, `PASSWORD_TOO_SHORT`, `LOGIN_TAKEN` |
| `signIn({ [login]: string, password })` | `{ status: 'signedIn', user, session, token }` — or, with `secondFactor` configured and the user's factor active, `{ status: 'secondFactor', challenge, expiresAt }`: switch on `status` | `CREDENTIALS_INVALID`, `USER_INACTIVE`, `HASH_UNSUPPORTED` |
| `findByLogin(login)` | the user, or `null`; the login is normalised first, and one holding a NUL or a lone surrogate is nobody's | |
| `setPassword(user, password, { ifVersion? })` | the user — an admin's call | `PASSWORD_TOO_SHORT` |
| `changePassword(user, { current, next }, { ifVersion? })` | the user — the user's own call | `CREDENTIALS_INVALID`, `PASSWORD_TOO_SHORT` |

With `secondFactor` configured, a type with a password also answers
`secondFactor.enroll`, `activate`, `disable` and `confirm` — see
[the second factor](second-factor.md).

Every method may also reject with `STORE_FAILED`. A `user` argument is a user
or its id (`UserRef = string | { id: string }`).

```ts
const grace = await auth.create({ email: 'grace@example.com', name: 'Grace', active: false });
await auth.find(grace.id);                         // User | null
await auth.get(grace.id);                          // User, or NOT_FOUND
const renamed = await auth.update(grace, { name: 'Grace Hopper' }, { ifVersion: grace.version });
await auth.setActive(renamed, true);
await auth.findByLogin('  GRACE@example.com ');    // found: normalised as sign-up normalised it
await auth.setPassword(renamed, 'a new password');
await auth.changePassword(renamed, { current: 'a new password', next: 'another password' });
await auth.delete(renamed);                        // true
```

### `update` merges, then validates the whole

The patch is spread over the stored fields and the result is checked against
the schema, so a patch can never leave a user the schema would refuse.
Changing the e-mail sets `emailVerified` back to `false`, and moves the login
with it when the e-mail is the login.

### `ifVersion`

Every write but `delete` takes `{ ifVersion }`. A user who changed since you
read them is `VERSION_CONFLICT`, and nothing is written: read again and retry.
A sign-in that rewrites a stale password hash moves `version` too, so an object
read before that sign-in conflicts — see [passwords](passwords.md#rehash-on-sign-in).

### `delete`

Deletes the user **with every session and one-time token they had**, and
every tuple naming them when `relations` is wired. The user goes first, so an
outage half-way leaves only sessions and tokens that authenticate nobody. It is
idempotent: calling it again finishes the job.

### Paging every user

```ts
let cursor: string | null = null;
do {
	const page = await auth.list({ after: cursor, limit: 100 });
	for (const user of page.items) console.log(user.email);
	cursor = page.nextCursor;
} while (cursor);
```

`limit` defaults to 20 and is capped at 100. There is no `total`.

### Across types

`findUser(id)` and `getUser(id)` are on the instance itself and find a user
whatever their type; the answer is a union narrowed by `user.type`.

## A sign-up route

A fetch-style handler — the shape Bun, Hono and most frameworks hand you:

```ts
import { JanusError } from '@nxgt/janus';

export async function signUpRoute(request: Request): Promise<Response> {
	const body = (await request.json()) as { email: string; name: string; password: string };
	try {
		const { user, session, token } = await auth.signUp(body);
		return Response.json(
			{ id: user.id },
			{ status: 201, headers: { 'Set-Cookie': auth.cookie.serialize(token, session) } },
		);
	} catch (error) {
		if (!(error instanceof JanusError)) throw error;
		switch (error.code) {
			case 'USER_INVALID':
				return Response.json({ issues: error.issues }, { status: 400 });
			case 'PASSWORD_TOO_SHORT':
				return Response.json({ minLength: error.minLength }, { status: 400 });
			case 'LOGIN_TAKEN':
				return Response.json({ error: 'taken' }, { status: 409 });
			default:
				throw error; // STORE_FAILED: your 503
		}
	}
}
```

Validate the body's shape yourself in a real route; `janus` validates the
fields against your schema, not that `password` is a string.

## See also

- [Sessions](sessions.md) — `authenticate`, the cookie, signing out
- [Errors](errors.md) — every code, and the status it deserves
- [Writing an adapter](adapters.md) — the identity stores behind `store`
