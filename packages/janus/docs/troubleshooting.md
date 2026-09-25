# Troubleshooting `@nxgt/janus`

Each entry is headed by the text you see: a compiler error, a message, or an
error `code`. Search this page for the words of your message.

How the messages are shaped:

- **Every message starts with the call you wrote**: `signIn: …`,
  `resetPassword.confirm: …`, `can: …`. With several user types, that call is
  prefixed by the type: `staff.signIn: …`. Below, `<call>` stands for it.
- **A `TypeError` is a wiring mistake**: it comes from how the application was
  put together — a configuration, a store, a model — and never from a request.
  Fix the code; no handler should answer one.
- **A `JanusError` is a refusal at call time**, on a value that could have come
  from a request. It carries a `code` you can `switch` on; the heading of each
  entry below names it.

## Index

**Install and types**
- [`TS2834: Relative import paths need explicit file extensions …`](#ts2834-relative-import-paths-need-explicit-file-extensions-in-ecmascript-imports-when---moduleresolution-is-node16-or-nodenext)
- [`TS2305: Module '"@nxgt/janus"' has no exported member '<name>'.`](#ts2305-module-nxgtjanus-has-no-exported-member-name)
- [`error instanceof StoreFailure` is `false` for an outage](#error-instanceof-storefailure-is-false-for-an-outage)

**Configuring `janus()`**
- [`janus: pass either user … or users …, and exactly one of them`](#janus-pass-either-user-one-kind-of-user-or-users-several-kinds-and-exactly-one-of-them)
- [`janus: user must be a Standard Schema …`](#janus-user-must-be-a-standard-schema--a-zod-4-valibot-or-arktype-schema)
- [`janus: a user type signs in with a password and no hasher is wired …`](#janus-a-user-type-signs-in-with-a-password-and-no-hasher-is-wired--pass-hasher-scrypthasher-or-bunhasher-on-bun-there-is-no-silent-fallback)
- [`bunHasher: Bun.password is not available …`](#bunhasher-bunpassword-is-not-available--this-runtime-is-not-bun-wire-scrypthasher-instead)
- [`scryptHasher: cost is log2(N), an integer from 10 to 20 …`](#scrypthasher-cost-is-log2n-an-integer-from-10-to-20--17-is-the-recommended-value)
- [`janus: two hashers claim the prefix "<prefix>" …`](#janus-two-hashers-claim-the-prefix-prefix--which-one-verifies-would-depend-on-their-order)
- [`janus: store.<slot> has no method <method>, which the port requires`](#janus-storeslot-has-no-method-method-which-the-port-requires)
- [`janus: relations must be a relation store — relations.deleteEntity is missing`](#janus-relations-must-be-a-relation-store--relationsdeleteentity-is-missing)
- [`janus: password.login must name a top-level field of the schema, such as "email"`](#janus-passwordlogin-must-name-a-top-level-field-of-the-schema-such-as-email)
- [`janus: password.login "<field>" did not name a string in validated <type> fields …`](#janus-passwordlogin-field-did-not-name-a-string-in-validated-type-fields--it-must-name-a-required-string-field)
- [`janus: the user type "<name>" must be a camelCase name …`](#janus-the-user-type-name-must-be-a-camelcase-name--letters-and-digits-starting-with-a-letter)
- [`janus: session.lifespan: "<value>" is not a duration …`](#janus-sessionlifespan-value-is-not-a-duration-write-a-number-followed-by-ms-s-m-h-or-d--for-example-15m-or-720h)
- [`janus: cookie.sameSite "none" requires cookie.secure …`](#janus-cookiesamesite-none-requires-cookiesecure--browsers-refuse-the-cookie-otherwise)
- [Other `janus:` wiring messages](#other-janus-wiring-messages)

**Users, sessions and tokens**
- [`STORE_FAILED` — `<slot>.<method>: the store could not answer`](#store_failed--slotmethod-the-store-could-not-answer)
- [`STORE_FAILED` — `<slot>.<method> answered undefined …`](#store_failed--slotmethod-answered-undefined-an-absence-is-null-so-this-store-forgot-to-answer)
- [`NOT_FOUND` — `<call>: no <type> has this id`](#not_found--call-no-type-has-this-id)
- [`LOGIN_TAKEN` — `<call>: the login is taken by another <type>`](#login_taken--call-the-login-is-taken-by-another-type)
- [`VERSION_CONFLICT` — `<call>: expected version <n>, found <m>`](#version_conflict--call-expected-version-n-found-m)
- [`USER_INVALID` — `<call>: the fields do not match the <type> schema …`](#user_invalid--call-the-fields-do-not-match-the-type-schema-n-issues-at-paths)
- [`PASSWORD_TOO_SHORT` — `<call>: the password is shorter than the policy's <n> characters`](#password_too_short--call-the-password-is-shorter-than-the-policys-n-characters)
- [`CREDENTIALS_INVALID` — `<call>: the login and the password do not match`](#credentials_invalid--call-the-login-and-the-password-do-not-match)
- [`HASH_UNSUPPORTED` — `<call>: no wired verifier claims the prefix "<prefix>"`](#hash_unsupported--call-no-wired-verifier-claims-the-prefix-prefix)
- [`scryptHasher: the stored hash has the $scrypt$ prefix and not its format`](#scrypthasher-the-stored-hash-has-the-scrypt-prefix-and-not-its-format)
- [`USER_INACTIVE` — `<call>: the user is inactive`](#user_inactive--call-the-user-is-inactive)
- [`TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`](#token_unknown-token_spent-token_expired)
- [`TOKEN_STALE` — `<call>: the token was sent to an e-mail the user no longer has`](#token_stale--call-the-token-was-sent-to-an-e-mail-the-user-no-longer-has)
- [`INVALID_CURSOR` — `<call>: this cursor was not minted by this store …`](#invalid_cursor--call-this-cursor-was-not-minted-by-this-store-or-was-minted-for-another-ordering-n-characters)
- [`<call>: limit must be an integer of at least 1, or absent`](#call-limit-must-be-an-integer-of-at-least-1-or-absent)
- [`UNSUPPORTED` — `collectExpired: store.sessions does not implement deleteExpiredSessions …`](#unsupported--collectexpired-storesessions-does-not-implement-deleteexpiredsessions--its-store-expires-sessions-on-its-own-or-implement-the-method)
- [`<call>: the <type> type does not sign in with a password …`](#call-the-type-type-does-not-sign-in-with-a-password--add-password--login--to-it)
- [`authenticate()` answers `null` although a valid cookie was sent](#authenticate-answers-null-although-a-valid-cookie-was-sent)

**Permissions**
- [`PERMISSION_DEPTH` — `can: checking <type>#<permission> crossed more than <n> relations without an answer`](#permission_depth--can-checking-typepermission-crossed-more-than-n-relations-without-an-answer)
- [`permissions: this model was not made by defineModel() …`](#permissions-this-model-was-not-made-by-definemodel--pass-what-definemodel-answered)
- [`permissions: store.<method> is missing`](#permissions-storemethod-is-missing)
- [`can: <type>.<relation> reads <field>, which the object does not carry …`](#can-typerelation-reads-field-which-the-object-does-not-carry--pass-the-loaded-object-spread)
- [`can: <type>.<name> reaches a condition, and no ctx was passed — pass { ctx }`](#can-typename-reaches-a-condition-and-no-ctx-was-passed--pass--ctx-)
- [`list: <type>.<relation> is read from a field, and has no lookup …`](#list-typerelation-is-read-from-a-field-and-has-no-lookup-to-find-the-types-naming-id--)
- [`list: the lookup of <type>.<relation> must answer an array of ids`](#list-the-lookup-of-typerelation-must-answer-an-array-of-ids)
- [`grant: <type>.<relation> is read from <field>; there is nothing to store …`](#grant-typerelation-is-read-from-field-there-is-nothing-to-store--change-the-type-instead)
- [`grant: <type>.<relation> is not held by <holder>`](#grant-typerelation-is-not-held-by-holder)
- [Other `can:`, `list:`, `grant:` and `revoke:` messages](#other-can-list-grant-and-revoke-messages)
- [`defineModel: …`](#definemodel-)

**Subjects**
- [`parseTuple: "<text>" is not a relation tuple; expected type:id#relation@subject`](#parsetuple-text-is-not-a-relation-tuple-expected-typeidrelationsubject)

**Conformance (adapter authors)**
- [`describeJanusStores: no test runner on globalThis …`](#describejanusstores-no-test-runner-on-globalthis--pass-runner--describe-it--under-bun-test-import-them-from-buntest)
- [`JANUS_CONFORMANCE_SKIPPED` — `faults not provided: the outage invariant is not proven for this adapter`](#janus_conformance_skipped--faults-not-provided-the-outage-invariant-is-not-proven-for-this-adapter)
- [`the error is named <Class> but is not @nxgt/janus's <Class>: two copies of @nxgt/janus are installed …`](#the-error-is-named-class-but-is-not-nxgtjanuss-class-two-copies-of-nxgtjanus-are-installed-the-adapter-must-list-it-as-a-peer-dependency-never-a-dependency)
- [`expected null, got undefined — an absence is null; undefined is a store that forgot to answer`](#expected-null-got-undefined--an-absence-is-null-undefined-is-a-store-that-forgot-to-answer)

---

## Install and types

### `TS2834: Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'.`

**When:** `tsc` on your project, reported inside `node_modules/@nxgt/janus/dist/*.d.ts`, once per import line.
**Why:** the declarations import their siblings without an extension (`'./auth/index'`), the way a bundler resolves them. `moduleResolution: "nodenext"` (or `"node16"`) demands an extension on every relative import and is **not supported** by this package.
**Fix:** resolve as a bundler does — Bun, Vite, esbuild and every other bundler already do:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "module": "preserve",          // or "esnext"
    "moduleResolution": "bundler"
  }
}
```

Do not patch the declarations to add `.js` extensions: that support is out of
scope, and a patched copy breaks on the next install.

### `TS2305: Module '"@nxgt/janus"' has no exported member '<name>'.`

**When:** `tsc` on your own file, for an export the README shows — typically `janus`, `createMemoryStores` or `scryptHasher`.
**Why:** the same `moduleResolution: "nodenext"` as above, with `skipLibCheck: true` hiding the `TS2834` errors in the declarations. The `export * from './auth/index'` in the package's entry declaration does not resolve, so everything it re-exports is missing.
**Fix:** `"moduleResolution": "bundler"`, as in the entry above.

### `error instanceof StoreFailure` is `false` for an outage

**When:** at run time, with an adapter from another package (`@nxgt/janus-mongo`, or your own). An outage is then handled as an unknown error, and a taken login can be reported as an outage.
**Why:** two copies of `@nxgt/janus` are installed — the adapter depends on it instead of peering it, or the versions it accepts do not include yours. The adapter throws its copy's `StoreFailure`, and your code tests against the other.
**Fix:** one copy. An adapter lists `@nxgt/janus` in `peerDependencies`, never `dependencies`; then check that only one is installed:

```sh
bun pm ls --all | grep @nxgt/janus
```

---

## Configuring `janus()`

Every entry here is a `TypeError` thrown by `janus(...)` itself, before any
request. With several user types, the option is prefixed by the type:
`janus: users.staff: password.login …`.

### `janus: pass either user (one user type) or users (several user types), and exactly one of them`

**When:** `janus({...})`, with both `user` and `users`, or neither.
**Why:** `user` is the shorthand for one user type; `users` declares several, each with its own schema and options. The two cannot be mixed.
**Fix:**

```ts
// One user type
janus({ user: User, password: { login: 'email' }, store, hasher });

// Several
janus({
  users: {
    patient: { schema: Patient, password: { login: 'email' } },
    staff: { schema: Staff, password: { login: 'username' } },
  },
  store,
  hasher,
});
```

### `janus: user must be a Standard Schema — a Zod 4, Valibot or ArkType schema`

With several types: `janus: users.<type>: schema must be a Standard Schema — a Zod 4, Valibot or ArkType schema`.

**When:** `janus({...})`.
**Why:** the value has no `['~standard'].validate`. It is a plain object, a TypeScript type used as a value, or a schema from a library version that does not implement [Standard Schema](https://standardschema.dev).
**Fix:** pass the schema object itself:

```ts
import { z } from 'zod'; // Zod 4
const User = z.object({ email: z.email(), name: z.string() });
janus({ user: User, password: { login: 'email' }, store, hasher });
```

### `janus: a user type signs in with a password and no hasher is wired — pass hasher: scryptHasher(), or bunHasher() on Bun. There is no silent fallback`

**When:** `janus({...})`, when a type has `password` and the configuration has no `hasher`.
**Why:** picking a hashing algorithm for you would be a silent choice about your users' passwords.
**Fix:**

```ts
import { janus, scryptHasher } from '@nxgt/janus';

janus({ user: User, password: { login: 'email' }, store, hasher: scryptHasher() });
```

### `bunHasher: Bun.password is not available — this runtime is not Bun; wire scryptHasher() instead`

**When:** calling `bunHasher()` under Node, or in a test runner that is not Bun.
**Why:** `bunHasher()` is argon2id through `Bun.password`, which only Bun provides.
**Fix:** `scryptHasher()` runs on both. To keep verifying argon2id hashes written under Bun while running on Node, you need a verifier for the `$argon2id$` prefix of your own in `verifiers`.

```ts
const hasher = typeof Bun === 'undefined' ? scryptHasher() : bunHasher();
```

### `scryptHasher: cost is log2(N), an integer from 10 to 20 — 17 is the recommended value`

**When:** `scryptHasher({ cost })`.
**Why:** `cost` is the exponent, not N: `cost: 131072` asks for 2^131072.
**Fix:** leave it out in production (17). In tests, `scryptHasher({ cost: 10 })` is fast and still runs every line.

### `janus: two hashers claim the prefix "<prefix>" — which one verifies would depend on their order`

Also: `janus: every hasher needs a non-empty prefix`.

**When:** `janus({...})` with `verifiers`.
**Why:** a stored hash is verified by the hasher whose `prefix` it starts with. Two hashers with one prefix — typically `hasher` repeated in `verifiers` — would make that depend on list order.
**Fix:** `hasher` already verifies its own hashes; `verifiers` only lists the *other* formats your database holds.

```ts
janus({ ..., hasher: scryptHasher(), verifiers: [legacyBcrypt] }); // not [scryptHasher(), legacyBcrypt]
```

### `janus: store.<slot> has no method <method>, which the port requires`

Also: `janus: store.<slot> is missing`, `janus: store must be an object with users, sessions and tokens`, `janus: store.sessions.deleteExpiredSessions must be a function or absent`.

**When:** `janus({...})`, from JavaScript or with a store typed loosely. TypeScript refuses a partial store at compile time and names the method.
**Why:** `store` is `{ users, sessions, tokens }`, and each slot must answer every method of the port. `deleteExpiredSessions` is the one optional method: absent, or a function.
**Fix:** pass the three stores, whole:

```ts
import { createMemoryStores, janus } from '@nxgt/janus';

janus({ ..., store: createMemoryStores() });
```

### `janus: relations must be a relation store — relations.deleteEntity is missing`

**When:** `janus({ ..., relations })`.
**Why:** `relations` takes the **relation store** — the same one `permissions()` takes as `store` — not what `permissions()` answers, nor the model.
**Fix:**

```ts
import { createMemoryRelations, permissions } from '@nxgt/janus/permissions';

const relations = createMemoryRelations();
const auth = janus({ ..., relations });            // deleting a user deletes their tuples
const access = permissions({ model, store: relations });
```

### `janus: password.login must name a top-level field of the schema, such as "email"`

Also `janus: email must name a top-level field of the schema, such as "email"`, and `janus: password.login: "<field>" is a field janus sets itself`.

**When:** `janus({...})`, from JavaScript; TypeScript refuses these on the `login` or `email` key first.
**Why:** a login and an e-mail are top-level fields of your schema, by name — not a path (`'contact.email'`), and not a field janus sets (`id`, `type`, `active`, `version`, …).
**Fix:**

```ts
janus({ user: z.object({ username: z.string() }), password: { login: 'username' }, ... });
```

### `janus: password.login "<field>" did not name a string in validated <type> fields — it must name a required string field`

**When:** `signUp`, `create` or `update`, when the validated fields have no string at the login field.
**Why:** the login field is optional or not a string in the schema. TypeScript refuses that shape at compile time; a schema typed loosely gets here.
**Fix:** make the login a required string: `username: z.string()`, not `z.string().optional()`.

### `janus: the user type "<name>" must be a camelCase name — letters and digits, starting with a letter`

Also `janus: "<name>" cannot name a user type — janus() answers a method of that name` and `janus: users declares no user type`.

**When:** `janus({ users: {...} })`.
**Why:** each type becomes a property of what `janus()` answers — `auth.staff` — so it must be a name, and not one of the shared methods (`authenticate`, `signOut`, `signOutEverywhere`, `findUser`, `getUser`, `cookie`, `collectExpired`, `types`).
**Fix:** `users: { staffMember: {...} }`, not `'staff-member'` or `cookie`.

### `janus: session.lifespan: "<value>" is not a duration; write a number followed by ms, s, m, h or d — for example "15m" or "720h"`

The same for `session.renewAfter`, `tokens.verifyEmail` and `tokens.resetPassword`. Also `<option>: a duration must be above zero` and `<option>: a duration in milliseconds must be a finite number above zero`.

**When:** `janus({...})`.
**Why:** a duration is a number of milliseconds, or a number followed by one unit. `'30 m'` compiles — TypeScript's `${number}` accepts the space — and is refused here.
**Fix:**

```ts
janus({ ..., session: { lifespan: '8h', renewAfter: '30m' }, tokens: { resetPassword: '1h' } });
```

### `janus: cookie.sameSite "none" requires cookie.secure — browsers refuse the cookie otherwise`

Also `janus: cookie.name must be a cookie-name token — letters, digits and !#$%&'*+-.^_\`|~, with no space, ";" or "="`.

**When:** `janus({ ..., cookie })`.
**Why:** browsers drop a `SameSite=None` cookie that is not `Secure`, so every sign-in would silently fail to stick.
**Fix:** keep `secure: true` with `sameSite: 'none'`, or use the default `sameSite: 'lax'` when the site and the API share a site.

### Other `janus:` wiring messages

| Message | Fix |
| --- | --- |
| `janus: expected a configuration object` | Pass an object to `janus()`. |
| `janus: password.minLength must be an integer of at least 1` | `password: { login: 'email', minLength: 12 }`. |
| `janus: password.normalize must be "none", "lowercase", "lowercaseTrim", "nfkcLowercaseTrim" or a function` | One of those names, or `(login) => string`. |

---

## Users, sessions and tokens

### `STORE_FAILED` — `<slot>.<method>: the store could not answer`

`StoreFailure`, for example `users.findUserByLogin: the store could not answer`.

**When:** any call that reaches the store — `authenticate`, `signIn`, `get`, `can` — while the database is down, times out, or the adapter throws.
**Why:** a store that cannot answer throws; it never answers `null`. The driver's own error is on `error.cause` — not in the message, because a driver message can hold a connection string, and a connection string holds a password.
**Fix:** answer **503**, and log `cause`. Never map it to 401, 404, `null` or `false`: that turns an outage into a silent lockout, where every user is told they do not exist.

```ts
import { JanusError } from '@nxgt/janus';

try {
  return await auth.authenticate(request);
} catch (error) {
  if (error instanceof JanusError && error.code === 'STORE_FAILED') {
    console.error(error.cause);
    return new Response('Try again shortly', { status: 503 });
  }
  throw error;
}
```

### `STORE_FAILED` — `<slot>.<method> answered undefined: an absence is null, so this store forgot to answer`

**When:** with a store you wrote, on the first call to that method.
**Why:** a method that can find nothing must answer `null`. `undefined` is also what a missing `return` produces, so it is treated as a bug in the store, not as "not found".
**Fix:** `return doc ?? null;` — and run `@nxgt/janus/conformance` against the store.

### `NOT_FOUND` — `<call>: no <type> has this id`

`NotFoundError`, from `get`, `getUser`, `update`, `setActive`, `setPassword`, `verifyEmail.send`. Also `<call>: the user has no e-mail`.

**When:** the id names nobody, names a user of another type (`auth.staff.get(patientId)`), or is not an id at all.
**Why:** `get*` calls turn an absence into `NOT_FOUND`; `find*` calls answer `null` instead.
**Fix:** answer 404, or use `find` when absence is an ordinary outcome:

```ts
const user = await auth.find(id); // null when there is nobody
```

### `LOGIN_TAKEN` — `<call>: the login is taken by another <type>`

`StoreConflict` with `on: 'login'`, carrying `login` and `userType`. The login is not in the message, which never carries a value: an e-mail in a log line is personal data. Read it from `error.login`.

**When:** `signUp`, `create`, or an `update` that changes the login, when another user of **the same type** holds it after normalisation (`Ada@Example.com` and `ada@example.com` collide by default).
**Why:** the store's unique constraint refused the write. A login is unique per user type: one e-mail may hold a patient user and a staff user.
**Fix:** answer 409. If two concurrent sign-ups with one login both succeed, the unique index is missing — with `@nxgt/janus-mongo`, run `syncMongoStores(db)`.

### `VERSION_CONFLICT` — `<call>: expected version <n>, found <m>`

`StoreConflict` with `on: 'version'`, carrying `expectedVersion` and `actualVersion`.

**When:** a write with `ifVersion`, after someone else changed the user.
**Why:** nothing was written. A sign-in moves `version` too, when it rewrites a stale password hash — so a user read before somebody signed in, then passed as `ifVersion`, conflicts.
**Fix:** read the user again and retry, or answer 409:

```ts
const user = await auth.get(id);
await auth.update(user, { name }, { ifVersion: user.version });
```

### `USER_INVALID` — `<call>: the fields do not match the <type> schema (<n> issues, at <paths>)`

`UserInvalidError`, carrying `issues` — each a `path` and a `message`.

**When:** `signUp`, `create`, `update`.
**Why:** your schema refused the fields. `update` merges the patch over the stored fields and validates the whole, so the refusal can name a field the patch did not touch. An issue whose message is `set by janus, not by a request` means the input carried a field janus sets (`id`, `active`, `version`, …) and your schema let it through.
**Fix:** answer 400, field by field:

```ts
if (error instanceof UserInvalidError) {
  return Response.json({ issues: error.issues }, { status: 400 });
}
```

### `PASSWORD_TOO_SHORT` — `<call>: the password is shorter than the policy's <n> characters`

**When:** `signUp`, `setPassword`, `changePassword`, `resetPassword.confirm`.
**Why:** the type's `password.minLength` (8 by default). `resetPassword.confirm` checks this **before** spending the token, so the visitor can retry with the same link.
**Fix:** answer 400 with `error.minLength`, or change the policy: `password: { login: 'email', minLength: 12 }`.

### `CREDENTIALS_INVALID` — `<call>: the login and the password do not match`

Also `changePassword: the current password does not match`.

**When:** `signIn`, `changePassword`.
**Why:** no user holds the login, the user has no password, or the password is wrong — **one code for the three**. `error.reason` (`unknownLogin`, `noPassword`, `wrongPassword`) tells them apart for your logs and your rate limiter.
**Fix:** answer 401 with the same body whatever the reason:

```ts
// Never: { reason: error.reason } — `unknownLogin` tells an attacker which users exist.
return new Response('Wrong e-mail or password', { status: 401 });
```

### `HASH_UNSUPPORTED` — `<call>: no wired verifier claims the prefix "<prefix>"`

**When:** `signIn` or `changePassword`, for a user whose stored hash was written by another system — typically after an import.
**Why:** the hash starts with a prefix (`$2b$`, `$argon2id$`, …) that neither `hasher` nor any of `verifiers` claims.
**Fix:** wire a verifier for that format; the next successful sign-in rewrites the hash with `hasher`:

```ts
janus({ ..., hasher: scryptHasher(), verifiers: [bcryptVerifier] }); // a PasswordHasher whose prefix is '$2b$'
```

### `scryptHasher: the stored hash has the $scrypt$ prefix and not its format`

**When:** `signIn` or `changePassword`, a `TypeError`.
**Why:** the stored hash starts with `$scrypt$` but is not `$scrypt$ln=…,r=…,p=…$<salt>$<key>`: it was truncated or written by another scrypt implementation.
**Fix:** repair the record, or `setPassword` for that user. It is not treated as a wrong password on purpose.

### `USER_INACTIVE` — `<call>: the user is inactive`

**When:** `signIn`, with the **right** password, for a user set inactive.
**Why:** an inactive user keeps their record and password, and every sign-in is refused. It is checked after the password, so only somebody who knows the password learns the user is inactive.
**Fix:** answer 403, or reactivate: `await auth.setActive(user, true)`.

### `TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`

`TokenError`: `<call>: no such token`, `<call>: the token was already used`, `<call>: the token has expired`.

**When:** `verifyEmail.confirm`, `resetPassword.confirm`.
**Why:** a token is spent by its first use, and an expired one is spent too. `TOKEN_UNKNOWN` also covers a token whose user was deleted. The defaults are 24 h for `verifyEmail`, 1 h for `resetPassword`.
**Fix:** answer 400 and offer to send a new link. To change the lifetimes:

```ts
janus({ ..., tokens: { verifyEmail: '72h', resetPassword: '2h' } });
```

### `TOKEN_STALE` — `<call>: the token was sent to an e-mail the user no longer has`

**When:** `verifyEmail.confirm` or `resetPassword.confirm`, after the user changed their e-mail.
**Why:** confirming it would verify an address nobody holds any more. The token is spent.
**Fix:** send a new token to the current address: `await auth.verifyEmail.send(user)`.

### `INVALID_CURSOR` — `<call>: this cursor was not minted by this store, or was minted for another ordering (<n> characters)`

**When:** `list({ after })`.
**Why:** `after` is not a `nextCursor` this store answered — edited, truncated, or from another list. It is never read as "first page", which would make a paging loop run forever.
**Fix:** pass `nextCursor` back as it came; `null` means the last page:

```ts
let after: string | null = null;
do {
  const page = await auth.list({ after, limit: 100 });
  after = page.nextCursor;
} while (after);
```

### `<call>: limit must be an integer of at least 1, or absent`

**When:** `list({ limit })` of users, or `access.list(..., { limit })`, a `TypeError`. Most often a limit read from a request: `Number(query.limit)` is `NaN` for `?limit=abc`, and the route answers 500.
**Why:** `limit` is a positive integer. Above 100 it is capped at 100, not refused. It is a `TypeError`, not a coded error, because the value is your code's to decide: parse a limit from a request before passing it.
**Fix:** leave it out (20), or pass `1`–`100`. From a query string, drop what is not a positive integer:

```ts
const asked = Number(query.limit); // c.req.query('limit') in Hono
const page = await access.list(user, 'view', 'record', {
	after: query.after ?? null,
	...(Number.isInteger(asked) && asked >= 1 ? { limit: asked } : {}), // 20 otherwise, 100 at most
});
```

### `UNSUPPORTED` — `collectExpired: store.sessions does not implement deleteExpiredSessions — its store expires sessions on its own, or implement the method`

**When:** `auth.collectExpired()`.
**Why:** the sessions store does not implement the optional `deleteExpiredSessions` — usually because it expires sessions itself (a MongoDB TTL index, a Redis `EXPIRE`).
**Fix:** do not schedule `collectExpired` for that store. Expiry does not depend on it: the core compares `expiresAt` on every `authenticate`.

### `<call>: the <type> type does not sign in with a password — add password: { login } to it`

**When:** `signIn`, `findByLogin`, `setPassword`, `changePassword`, `resetPassword.*`, from JavaScript. In TypeScript, these methods are absent from a type without `password`.
**Why:** the user type has no `password` option.
**Fix:** `users: { staff: { schema: Staff, password: { login: 'email' } } }`.

### `authenticate()` answers `null` although a valid cookie was sent

**When:** `auth.authenticate(request)` on a request that also carries an `Authorization: Bearer` or an `X-Session-Token` header.
**Why:** the **first credential present** wins, not the first valid one: `Authorization: Bearer`, then `X-Session-Token`, then the cookie. A lapsed bearer beside a live cookie is anonymous.
**Fix:** stop the client sending the stale header. A `null` is never an outage: when the store cannot answer, `authenticate` rejects with `STORE_FAILED` — answer 503, not 401.

---

## Permissions

### `PERMISSION_DEPTH` — `can: checking <type>#<permission> crossed more than <n> relations without an answer`

Also `list: listing <type>#<permission> crossed more than <n> relations without an answer`. `PermissionDepthError`, carrying `permission` and `maxDepth`.

**When:** `access.can(...)` or `access.list(...)`.
**Why:** the walk crossed more than `maxDepth` relations (25 by default) and reached no decision. It is not a denial: a check that stopped half-way decided nothing. A cycle in the data — a team member of itself — is cut silently and never causes this.
**Fix:** answer 500 and look at the model or the data: a very deep hierarchy, or a chain of subject sets. If the depth is genuine, raise it:

```ts
const access = permissions({ model, store, maxDepth: 50 });
```

### `permissions: this model was not made by defineModel() — pass what defineModel() answered`

**When:** `permissions({ model, store })`.
**Why:** `model` is the plain configuration object, or a copy of the model (spread, `structuredClone`, JSON round trip).
**Fix:**

```ts
import { defineModel, permissions } from '@nxgt/janus/permissions';

const model = defineModel({ subjects: auth.types, types: { ... } });
const access = permissions({ model, store });
```

### `permissions: store.<method> is missing`

Also `permissions: maxDepth must be a positive integer`.

**When:** `permissions({ model, store })`.
**Why:** `store` must be a relation store — `write`, `has`, `findSubjectSets`, `findEntities`, `findObjects`, `deleteEntity` — not the `{ users, sessions, tokens }` given to `janus()`.
**Fix:** `permissions({ model, store: createMemoryRelations() })`, or your adapter's relation store.

### `can: <type>.<relation> reads <field>, which the object does not carry — pass the loaded object, spread`

Also `can: <type>.<relation> reads <field>, which the object holds as something other than a string id`.

**When:** `access.can(subject, permission, object)` on a type with a `fromField` relation.
**Why:** `fromField('doctorId', 'staff')` reads `doctorId` from the object you pass. Missing, it is an error, never a denial. `null` in the field holds nobody.
**Fix:** pass the loaded object, spread:

```ts
await access.can(staff, 'view', { type: 'record', ...record });
```

### `can: <type>.<name> reaches a condition, and no ctx was passed — pass { ctx }`

Also `list: <type>.<name> reaches a condition, and no ctx was passed — pass { ctx }`.

**When:** `can` or `list`, when a rule reached by the check is a `when(...)`.
**Why:** a condition runs on the `ctx` you pass. A missing `ctx` is a caller's bug, not a denial.
**Fix:**

```ts
await access.can(staff, 'edit', { type: 'record', ...record }, { ctx: { onShift } });
```

### `list: <type>.<relation> is read from a field, and has no lookup to find the <type>s naming <id> — …`

**When:** `access.list(subject, permission, type)` through a `fromField` relation.
**Why:** `list()` walks backwards from the subject, so it cannot read a field of objects it has not found yet. It asks your `lookup` for the ids of the objects whose field names the subject.
**Fix:**

```ts
fromField('doctorId', 'staff', { lookup: (id) => db.records.idsWhere({ doctorId: id }) });
```

A `lookup` is your code and is not guarded: if it throws, `list()` rejects with that error. Never answer `[]` for a database that could not answer — that is an outage turned into a denial.

### `list: the lookup of <type>.<relation> must answer an array of ids`

**When:** `access.list(...)`.
**Why:** the `lookup` answered something other than `string[]` — documents, `ObjectId`s, or `undefined`.
**Fix:** `lookup: async (id) => (await findRecords({ doctorId: id })).map((r) => r.id)`.

### `grant: <type>.<relation> is read from <field>; there is nothing to store — change the <type> instead`

Also with `revoke:`.

**When:** `access.grant(...)` or `access.revoke(...)` on a `fromField` relation.
**Why:** that relation lives in the object's own data, not in a tuple.
**Fix:** update the object — for example set `record.doctorId` — in your own database.

### `grant: <type>.<relation> is not held by <holder>`

Also with `revoke:`.

**When:** `access.grant(object, relation, subject)`.
**Why:** the model's relation does not admit that kind of subject: `member: ['staff']` refuses a `patient`, and refuses the subject set `team#member` unless it is listed.
**Fix:** grant a subject the relation admits, or add the holder to the model: `member: ['staff', 'team#member']`.
With `revoke:` on a tuple stored before the model stopped admitting it, the tuple already grants nothing; remove it through the store: `relations.write({ remove: [tuple] })`.

### Other `can:`, `list:`, `grant:` and `revoke:` messages

Each is a `TypeError` naming the call. TypeScript refuses most of them on the argument first.

| Message | Fix |
| --- | --- |
| `can: "<name>" is not a relation or a permission of <type>` | Ask a name the type declares. |
| `<call>: "<type>" is not an object type of the model` | Use a type declared under `types`. |
| `<call>: the object must be { type, id, …its fields }` | `{ type: 'record', ...record }`. |
| `<call>: the subject must be a user, or { type, id }` | Pass the user from `janus()`, or `{ type, id }`. `null` is anonymous and answers `false`. |
| `<call>: the object id must be a non-empty string without @, # or parentheses` | Also for `the subject id`. Those characters belong to the tuple notation. |
| `<call>: "<relation>" is not a relation of <type>, so <type>:<id>#<relation> is no subject set` | A subject set names a relation of its type: `{ type: 'team', id, relation: 'member' }`. |
| `grant: "<relation>" is not a relation of <type>` | Grant a relation, never a permission. |
| `list: the type must be an object type of the model` | The third argument is a type name: `'record'`. |
| `list: after must be the nextCursor of a page, or null` | Pass `nextCursor` back as it came. |

### `defineModel: …`

`defineModel` refuses with a `TypeError` what only running it can see. The
most common:

| Message | Fix |
| --- | --- |
| `defineModel: subjects must be an array of subject type names — auth.types from janus(), or your own` | `defineModel({ subjects: auth.types, types })` with `janus()`, or your own names alone: `subjects: ['user']`. |
| `defineModel: types declares no object type` | Declare at least one type under `types`. |
| `defineModel: the object type "<name>" must be a camelCase name — letters and digits, starting with a lowercase letter` | Also for relation and permission names. |
| `defineModel: "<name>" names a user type and an object type; a subject of type "<name>" would be ambiguous` | Rename the object type. |
| `defineModel: types.<type>: "<name>" names a relation and a permission; rename one` | One name, one meaning. |
| `defineModel: types.<type>.permissions: <a> → <b> → <a> is a loop no relation ends` | A permission must cross a relation before it reaches itself again. |
| `defineModel: … "<rule>" goes through "<relation>", which can hold a subject set; an arrow follows object types only` | An arrow's relation must hold object types: `team: ['team']`. |
| `defineModel: … "<rule>" names "<target>", which <type> does not declare` | Arrow to a relation or permission of the target type. |
| `defineModel: … reads <type>.<field>, and a subject set reaches <type>s nobody passed to can() — store that relation instead of reading it` | Only the object passed to `can()` carries data: a `fromField` there cannot be reached through a subject set or an arrow. Store it as a tuple. |

---

## Subjects

### `parseTuple: "<text>" is not a relation tuple; expected type:id#relation@subject`

Also `parseSubject: "<text>" is not a subject; expected type:id, or type:id#relation for a subject set`.

**When:** `parseTuple(...)` or `parseSubject(...)`, a `TypeError`.
**Why:** subjects are typed. `record:r1#viewer@alice` — Keto's untyped subject — is refused. No part may hold `@`, `#` or a parenthesis, and a type may not hold `:`.
**Fix:**

```ts
import { parseTuple } from '@nxgt/janus';

parseTuple('record:r1#viewer@staff:u1');
parseTuple('record:r1#viewer@team:t1#member');
```

---

## Conformance (adapter authors)

### `describeJanusStores: no test runner on globalThis — pass runner: { describe, it } (under bun test: import them from 'bun:test')`

The same for `describeRelationStores`.

**When:** loading the spec file.
**Why:** `bun test` gives a file `describe` and `it` as bare identifiers, not as properties of `globalThis`. jest, and vitest with `globals: true`, are found without it.
**Fix:**

```ts
import { describe, it } from 'bun:test';
import { describeJanusStores } from '@nxgt/janus/conformance';

describeJanusStores({ name: 'my adapter', runner: { describe, it }, harness });
```

### `JANUS_CONFORMANCE_SKIPPED` — `faults not provided: the outage invariant is not proven for this adapter`

A process warning, and the outage cases reported as skipped.

**When:** running the suite with a harness that opens stores without `faults`.
**Why:** the outage cases need a way to make the database fail. Their absence is reported, never passed over.
**Fix:** return `faults` from `open()`, failing **only the method named**, the way the database really fails — for MongoDB, the `failCommand` failpoint. A wrapper that throws in front of the adapter proves the wrapper, not the adapter.

### `the error is named <Class> but is not @nxgt/janus's <Class>: two copies of @nxgt/janus are installed. The adapter must list it as a peer dependency, never a dependency`

**When:** a conformance case that checks the class of an error — the outage and conflict cases.
**Why:** the adapter imports its own copy of `@nxgt/janus`, so its `StoreFailure` or `StoreConflict` is not the core's, and `instanceof` fails.
**Fix:** move `@nxgt/janus` to `peerDependencies` (and `devDependencies` for the tests), then reinstall.

### `expected null, got undefined — an absence is null; undefined is a store that forgot to answer`

**When:** a conformance case on a `find*` method.
**Why:** the adapter answers `undefined` for "not found". Many drivers do; the port does not.
**Fix:** `return document ?? null;`.
