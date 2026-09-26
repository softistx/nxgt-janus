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
- [`janus: pass either user … or users …, and exactly one of them`](#janus-pass-either-user-one-user-type-or-users-several-user-types-and-exactly-one-of-them)
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
- [`janus: secondFactor.issuer must name your application …`](#janus-secondfactorissuer-must-name-your-application--the-authenticator-app-shows-it-beside-the-account)
- [`janus: secondFactor.keys: the key "<id>" is not 32 bytes in base64 …`](#janus-secondfactorkeys-the-key-id-is-not-32-bytes-in-base64--make-one-with-openssl-rand--base64-32)
- [`"hasSecondFactor" is a field janus sets itself; rename it`](#hassecondfactor-is-a-field-janus-sets-itself-rename-it)
- [`janus: events must be a function that takes a user event …`](#janus-events-must-be-a-function-that-takes-a-user-event--webhooks---from-nxgtjanus-webhooks-or-your-own)
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

**Second factor**
- [`TS2339: Property 'token' does not exist on type 'SignInResult<…>'.`](#ts2339-property-token-does-not-exist-on-type-signinresult)
- [`CODE_INVALID` — `<call>: the code does not match, or was already used`](#code_invalid--call-the-code-does-not-match-or-was-already-used)
- [The code the authenticator app shows is refused with `CODE_INVALID`](#the-code-the-authenticator-app-shows-is-refused-with-code_invalid)
- [`SECOND_FACTOR_NOT_ENROLLED` — `secondFactor.activate: the user has no second factor waiting …`](#second_factor_not_enrolled--secondfactoractivate-the-user-has-no-second-factor-waiting--call-enroll-first)
- [`SECOND_FACTOR_ACTIVE` — `secondFactor.enroll: the user's second factor is active …`](#second_factor_active--secondfactorenroll-the-users-second-factor-is-active--disable-it-first)
- [`<call>: …, and janus() was given no secondFactor …`](#call--and-janus-was-given-no-secondfactor--pass-secondfactor--issuer-keys-)
- [`<call>: the secret is sealed with the key "<id>", which secondFactor.keys no longer holds …`](#call-the-secret-is-sealed-with-the-key-id-which-secondfactorkeys-no-longer-holds--keep-a-key-until-no-secret-is-sealed-with-it)
- [`<call>: the secret does not open with the key "<id>" — was that key changed under the same id, or the secret copied from another user?`](#call-the-secret-does-not-open-with-the-key-id--was-that-key-changed-under-the-same-id-or-the-secret-copied-from-another-user)
- [`<call>: the stored secret is not a sealed one`](#call-the-stored-secret-is-not-a-sealed-one)
- [`<call>: the <type> type does not sign in with a password, so it has no second factor`](#call-the-type-type-does-not-sign-in-with-a-password-so-it-has-no-second-factor)
- `TOKEN_*`, `USER_INACTIVE` and `VERSION_CONFLICT` from `secondFactor.confirm`: in their entries above.

**Sign-in codes**
- [`TOKEN_STALE` — `<call>: the code was sent to an e-mail the user no longer has`](#token_stale--call-the-code-was-sent-to-an-e-mail-the-user-no-longer-has)
- [The code from an earlier e-mail is refused with `CODE_INVALID`](#the-code-from-an-earlier-e-mail-is-refused-with-code_invalid)
- [`signInCode.request` answers `null` for a user who exists](#signincoderequest-answers-null-for-a-user-who-exists)
- [`TS2339: Property 'signInCode' does not exist on type 'TypeApi<…>'.`](#ts2339-property-signincode-does-not-exist-on-type-typeapi)
- `CODE_INVALID`, `TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`, `USER_INACTIVE` and `VERSION_CONFLICT` from `signInCode.confirm`, and `TS2339` on its `token`: in their entries above.

**User events**
- [`[JANUS_EVENT_FAILED] Warning: janus: the events listener failed on <type> <event id> for user <user id>: <name>`](#janus_event_failed-warning-janus-the-events-listener-failed-on-type-event-id-for-user-user-id-name)
- [An event you expected never arrived](#an-event-you-expected-never-arrived)

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
- [`setOf: pass a user or { type, id }, then a relation`](#setof-pass-a-user-or--type-id--then-a-relation)

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
An adapter written for an earlier `@nxgt/janus` reports the method a later
release added to the port: `store.tokens has no method countAttempt` for one
written against 0.3 (the method came in 0.4), and
`store.tokens has no method spendUserTokens` for one written against 0.6 (the
method came in 0.7).

**Fix:** pass the three stores, whole:

```ts
import { createMemoryStores, janus } from '@nxgt/janus';

janus({ ..., store: createMemoryStores() });
```

Upgrade the published adapter to the release that implements both —
`@nxgt/janus-drizzle` 0.3, `@nxgt/janus-mongo` 0.4, `@nxgt/janus-redis` 0.3:

```bash
bun add @nxgt/janus@^0.7 @nxgt/janus-drizzle@^0.3 # or @nxgt/janus-mongo@^0.4, @nxgt/janus-redis@^0.3
```

Your own adapter implements them as
[`TokenStore.countAttempt`](guide/adapters.md#tokenstorecountattempt) and
[`TokenStore.spendUserTokens`](guide/adapters.md#tokenstorespendusertokens)
set out, then runs the conformance suite.

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

The same for `session.renewAfter`, `tokens.verifyEmail`, `tokens.resetPassword`, `tokens.signInCode` and `secondFactor.challenge`. Also `<option>: a duration must be above zero` and `<option>: a duration in milliseconds must be a finite number above zero`.

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

### `janus: secondFactor.issuer must name your application — the authenticator app shows it beside the account`

**When:** `janus({ ..., secondFactor })`, when `issuer` is missing, is not a string, or is blank.
**Why:** the issuer is the label the authenticator app shows beside the account. Without it, a user with several accounts in the app cannot tell which code is yours.
**Fix:**

```ts
janus({ ..., secondFactor: { issuer: 'Acme', keys } });
```

### `janus: secondFactor.keys: the key "<id>" is not 32 bytes in base64 — make one with openssl rand -base64 32`

Also:

- `janus: secondFactor.keys: expected at least one key — [{ id, key }], the first seals`
- `janus: secondFactor.keys: every key needs an id of letters, digits, _ and -, at most 64 of them`
- `janus: secondFactor.keys: two keys have the id "<id>"`

**When:** `janus({ ..., secondFactor })`.
**Why:** every TOTP secret is sealed with AES-256-GCM before a store sees it, and that takes a 32-byte key: 43 characters of base64 or base64url, with or without the trailing `=`. A hex key (64 characters), a passphrase, or an environment variable that is not set is refused. The id is written into every secret the key seals, so it is short, plain, and names one key only.
**Fix:** make each key once and keep it with your other secrets:

```sh
openssl rand -base64 32
```

```ts
janus({
  ...,
  secondFactor: {
    issuer: 'Acme',
    keys: [{ id: 'k2026a', key: process.env.TOTP_KEY_K2026A ?? '' }], // the first key seals
  },
});
```

### `"hasSecondFactor" is a field janus sets itself; rename it`

**When:** `tsc`, on the `janus({...})` call, when your schema declares a `hasSecondFactor` field. This version added it to the fields janus sets on every user.
**Why:** `user.hasSecondFactor` is janus's own answer: whether the user's second factor is active. A field of yours with that name would be shadowed. From JavaScript, a validated input holding it is refused with `USER_INVALID` and the issue `set by janus, not by a request`.
**Fix:** rename the field in your schema, and read `user.hasSecondFactor` for janus's answer.

### `janus: events must be a function that takes a user event — webhooks({ … }) from @nxgt/janus-webhooks, or your own`

**When:** `janus({ events })` with something other than a function — most often an object of functions, one per event type.
**Why:** `events` is one listener, called with every user event; the event's `type` says which.
**Fix:** pass one function, and switch on `type`:

```ts
janus({
  ...config,
  events(event) {
    if (event.type === 'user.created') return welcome(event.userId);
  },
});
```

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

**From `secondFactor.confirm`**, the message is the store's:
`updateUser: expected version <n>, found <m>`.

**When:** two `confirm` calls for one user run at once with the same code — a
double-submitted form, two tabs, a client that retries before the first answer.
**Why:** of two codes accepted at once, the first write wins and opens a
session. The second finds the user's version moved and writes nothing: no
session. Its challenge is not spent, and has lost one attempt.
**Fix:** submit the code form once. The session already exists, from the call
that won; if the visitor still needs one, the next code works on the same
challenge — the same code will not, it was used.

```ts
// in the browser: one submit per code
form.addEventListener('submit', () => form.querySelector('button')?.setAttribute('disabled', ''));
```

### `USER_INVALID` — `<call>: the fields do not match the <type> schema (<n> issues, at <paths>)`

`UserInvalidError`, carrying `issues` — each a `path` and a `message`.

**When:** `signUp`, `create`, `update`.
**Why:** your schema refused the fields. `update` merges the patch over the stored fields and validates the whole, so the refusal can name a field the patch did not touch. An issue whose message is `set by janus, not by a request` means the input carried a field janus sets (`id`, `active`, `version`, …) and your schema let it through. An issue whose message is `holds a NUL character or a lone surrogate, which no store can keep` means a string — or, with `a key holds …`, an object key — carried `\u0000` or half of a surrogate pair: PostgreSQL refuses both, so janus refuses them on every adapter rather than answer `STORE_FAILED` on one. A key is reported by the path of the object holding it, never by the key itself — in janus's issues and in your schema's alike. An issue at your login field whose message is `normalises to a login that holds …` means your own `password.normalize` function produced such a login from a valid field: fix the function. On MongoDB or the memory store, a user written before janus refused these characters may already hold one: every `update` of that user is refused, whatever it patches, until the field is cleaned — patch it with a clean value in the same `update`.
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
**Why:** no user holds the login, the user has no password, or the password is wrong — **one code for the three**. Also a sign-in that verified a password written over while it ran (`reason: 'wrongPassword'`): its session is revoked, or its challenge spent, before the refusal. `error.reason` (`unknownLogin`, `noPassword`, `wrongPassword`) tells them apart for your logs and your rate limiter. A login holding a NUL character or a lone surrogate is `unknownLogin`: no user can hold one.
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

**When:** `signIn`, with the **right** password, for a user set inactive. Also `secondFactor.confirm`, for a user set inactive after `signIn` asked for a code, and `signInCode.confirm`, for a user set inactive after the code was sent.
**Why:** an inactive user keeps their record and password, and every sign-in is refused. It is checked after the password, so only somebody who knows the password learns the user is inactive — and after the code, so only somebody who read the e-mail does: `signInCode.request` answers `null` for an inactive user, as for nobody. On either `confirm`, the challenge is spent: reactivating the user does not revive it.
**Fix:** answer 403, or reactivate, then sign in again: `await auth.setActive(user, true)`.

### `TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`

`TokenError`: `<call>: no such token`, `<call>: the token was already used`, `<call>: the token has expired`.

**When:** `verifyEmail.confirm`, `resetPassword.confirm`.
**Why:** a token is spent by its first use, and an expired one is spent too. `TOKEN_UNKNOWN` also covers a token whose user was deleted. The defaults are 24 h for `verifyEmail`, 1 h for `resetPassword`.
**Fix:** answer 400 and offer to send a new link. To change the lifetimes:

```ts
janus({ ..., tokens: { verifyEmail: '72h', resetPassword: '2h' } });
```

**On `secondFactor.confirm`**, the messages name the challenge `signIn`
answered: `secondFactor.confirm: no such challenge`,
`secondFactor.confirm: the challenge was already used`,
`secondFactor.confirm: the challenge has expired`.

**When:** `secondFactor.confirm(challenge, code)`.
**Why:** a challenge lives five minutes and takes five codes. It is spent by
the code that opens the session, by the fifth wrong code, by a refusal
that ends it (`USER_INACTIVE`, `SECOND_FACTOR_NOT_ENROLLED`), and by a
password written — `resetPassword.confirm`, `setPassword`, `changePassword` —
which ends every sign-in left waiting on its code.
`TOKEN_UNKNOWN` also covers a challenge whose user was deleted, one
confirmed through another user type's `secondFactor`, and a challenge passed
where a code was expected — the two arguments swapped. Another type's
`confirm` still costs an attempt, and the fifth spends the challenge.
**Fix:** answer 400 and send the visitor back to sign in, which asks for a new
code. To give slower visitors more time:

```ts
janus({ ..., secondFactor: { issuer: 'Acme', keys, challenge: '10m' } });
```

**On `signInCode.confirm`**, the messages name the challenge
`signInCode.request` answered: `signInCode.confirm: no such challenge`,
`signInCode.confirm: the challenge was already used`,
`signInCode.confirm: the challenge has expired`.

**When:** `signInCode.confirm(challenge, code)`.
**Why:** a challenge lives ten minutes and takes five codes. It is spent by
the code that signs the user in, by the fifth wrong code, by a refusal
that ends it (`TOKEN_STALE`, `USER_INACTIVE`), and by the next `request` for
the same user: only the last code sent works, so a visitor who asked twice
and typed the first code gets `TOKEN_SPENT` — and when two requests race,
even the last code can be spent: at most one survives, sometimes none. `TOKEN_UNKNOWN` also covers a
challenge whose user was deleted, one confirmed through another user type's
`signInCode`, the decoy challenge of a `request` that answered `null`, and
the two arguments swapped. Another type's `confirm` compares no code, but it
has already cost one of the challenge's five
attempts: the attempt is counted before the type is known. The challenge is
left for its own type, with one attempt fewer — and the fifth such call
spends it, as a fifth wrong code would.
**Fix:** answer 400 and offer to send a new code — and tell the visitor to
use the latest e-mail. To give slower inboxes
more time:

```ts
janus({ ..., tokens: { signInCode: '15m' } });
```

### `TOKEN_STALE` — `<call>: the token was sent to an e-mail the user no longer has`

**When:** `verifyEmail.confirm` or `resetPassword.confirm`, after the user changed their e-mail — even while the link was being redeemed: the address is checked again on the very record the write replaces.
**Why:** confirming it would verify an address nobody holds any more, or reset a password through one. The token is spent, and nothing is written.
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

## Second factor

Every entry here needs `janus({ ..., secondFactor })`, but for the
`signInCode.confirm` paragraph of `CODE_INVALID`. The messages start with
`secondFactor.enroll`, `secondFactor.activate`, `secondFactor.confirm` or
`signIn` — prefixed by the type with several user types:
`staff.secondFactor.confirm: …`. `secondFactor.confirm` also rejects with
[`TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`](#token_unknown-token_spent-token_expired),
[`USER_INACTIVE`](#user_inactive--call-the-user-is-inactive) and
[`VERSION_CONFLICT`](#version_conflict--call-expected-version-n-found-m);
each of those entries has a paragraph for it.

### `TS2339: Property 'token' does not exist on type 'SignInResult<…>'.`

The same for `session` and `user`.

**When:** `tsc`, wherever `signIn`'s answer is read, once `janus()` is given a `secondFactor` — and `signInCode.confirm`'s, on a user type with a password.
**Why:** `signIn` then answers one of two shapes: `{ status: 'signedIn', user, session, token }`, or `{ status: 'secondFactor', challenge, expiresAt, userId }` for a user whose second factor is active — the password alone opens no session for them. Without `secondFactor`, `signIn` still answers a session.
**Fix:** switch on `status`:

```ts
const result = await auth.signIn({ email, password });
if (result.status === 'secondFactor') {
  // Keep the challenge for the next request — never in a URL — and ask for a code.
  return Response.json({ challenge: result.challenge, expiresAt: result.expiresAt });
}
return Response.json({ token: result.token });

// the next request, with the code the app shows
const signedIn = await auth.secondFactor.confirm(challenge, code); // { status: 'signedIn', token, … }
```

### `CODE_INVALID` — `<call>: the code does not match, or was already used`

`TokenError`. The same message answers three calls; there is a paragraph
for each below.

**When:** `secondFactor.activate`, `secondFactor.confirm` or
`signInCode.confirm`, with a code that does not match.

**`secondFactor.activate(user, code)`**
**Why:** the code is wrong, or it was accepted before: a code is accepted
once. There is no challenge here: no `attemptsLeft`, and nothing is spent.
**Fix:** let the user try the next code the app shows. If it is the one on
screen, see [the next entry](#the-code-the-authenticator-app-shows-is-refused-with-code_invalid).

**`secondFactor.confirm(challenge, code)`**
**Why:** the code is wrong, or it was accepted before. Every call costs one of
the challenge's five attempts, counted before anything is checked. The error
carries `attemptsLeft`, what remains; at `0`, the challenge is spent and the
next `confirm` is `TOKEN_SPENT`.
**Fix:** answer 401 with `attemptsLeft`, and send the visitor back to sign in
once it is `0`:

```ts
import { TokenError } from '@nxgt/janus';

try {
  return await auth.secondFactor.confirm(challenge, code);
} catch (error) {
  if (error instanceof TokenError && error.code === 'CODE_INVALID') {
    return Response.json({ code: error.code, attemptsLeft: error.attemptsLeft }, { status: 401 });
  }
  throw error;
}
```

**`signInCode.confirm(challenge, code)`** — the e-mailed code.
**Why:** the code is not the one sent with this challenge, or is not six
digits — a space, a dash, a code pasted with its label. The error carries
`attemptsLeft` and the `userId` of the user the code was sent to. Every call
costs one of the challenge's five attempts, counted before the code is
compared — a call through another user type's `signInCode` too, although it
answers `TOKEN_UNKNOWN`. At `0` the challenge is spent, and the next
`confirm` is `TOKEN_SPENT`, even with the right code. Codes sent at once past
the fifth attempt are all refused, the right one included.
**Fix:** answer 401 with `attemptsLeft`, and request a new code once it is
`0`. Strip what the visitor may have typed around the digits before calling
`confirm`:

```ts
import { TokenError } from '@nxgt/janus';

try {
  return await auth.signInCode.confirm(challenge, code.replace(/\D/g, ''));
} catch (error) {
  if (error instanceof TokenError && error.code === 'CODE_INVALID') {
    return Response.json({ code: error.code, attemptsLeft: error.attemptsLeft }, { status: 401 });
  }
  throw error;
}
```

If the visitor typed the code from the e-mail correctly, see
[the code from an earlier e-mail](#the-code-from-an-earlier-e-mail-is-refused-with-code_invalid).

### The code the authenticator app shows is refused with `CODE_INVALID`

**When:** `activate` or `confirm`, with the code on screen, typed correctly.
**Why**, in the order to check:

1. **A clock is off.** A code is accepted in its own 30-second step and one step either side. A phone or a server whose clock is more than about 30 seconds away from the real time produces codes outside those three steps. How many steps are accepted is not configurable.
2. **The code was already used** — and so were the codes before it. Once a code is accepted, that code and every earlier one are refused: the user who activates and then signs in within the same 30 seconds, or who signs in twice in a row, must wait for the next code.
3. **The app holds an older secret.** `enroll` called again before `activate` replaces the secret: an entry scanned from the first `enroll` shows codes for a secret nobody holds any more.

**Fix:** for 1, keep the server's clock synchronised and ask the user to set their phone's time automatically. For 2, wait for the next code. For 3, delete the entry from the app and scan the `uri` of the last `enroll`.

```sh
timedatectl show -p NTPSynchronized   # NTPSynchronized=yes on the server
```

### `SECOND_FACTOR_NOT_ENROLLED` — `secondFactor.activate: the user has no second factor waiting — call enroll first`

`SecondFactorError`. Also `secondFactor.confirm: the user no longer has a second factor — sign in again`.

**When:** `activate` before `enroll`, or after `disable`. On `confirm`: the factor was disabled after `signIn` asked for a code.
**Why:** `activate` checks a code against the secret `enroll` wrote, and there is none. On `confirm`, the factor the challenge asked for is gone, so the challenge is spent.
**Fix:** `enroll`, show the `uri` as a QR code, then `activate` with a code from the app. After `confirm`'s refusal, sign in again: `signIn` answers a session directly for a user without a factor.

```ts
const { secret, uri } = await auth.secondFactor.enroll(user);
// …the user scans uri, or types secret…
await auth.secondFactor.activate(user, code);
```

### `SECOND_FACTOR_ACTIVE` — `secondFactor.enroll: the user's second factor is active — disable it first`

`SecondFactorError`. Also `secondFactor.activate: the user's second factor is already active`.

**When:** `enroll` or `activate` for a user whose factor is already active — often a form submitted twice, or a "set up again" button.
**Why:** enrolling again would replace the secret and quietly switch the factor off until the new one is activated. It is refused so that only `disable` switches it off.
**Fix:** check `user.hasSecondFactor` first. To move to a new phone, disable, then enroll:

```ts
const cleared = await auth.secondFactor.disable(user);
const { uri } = await auth.secondFactor.enroll(cleared);
```

### `<call>: …, and janus() was given no secondFactor — pass secondFactor: { issuer, keys }`

Most often: `signIn: the user's second factor is active, and janus() was given no secondFactor — pass secondFactor: { issuer, keys }`. A `TypeError`.

**When:** `signIn` for a user whose factor is active, on a `janus()` built without `secondFactor` — a second process over the same users: a worker, a script, an admin service, an older deployment. From JavaScript, `enroll`, `activate` and `confirm` on such an instance too.
**Why:** the password alone never opens a session for a user with an active factor, and an instance without keys cannot check a code. It refuses rather than sign the user in on the password alone.
**Fix:** give every `janus()` over the same users the same `secondFactor`, from one module:

```ts
// auth-config.ts, imported by every process
export const secondFactor = { issuer: 'Acme', keys } as const;

janus({ ..., secondFactor });
```

### `<call>: the secret is sealed with the key "<id>", which secondFactor.keys no longer holds — keep a key until no secret is sealed with it`

A `TypeError`.

**When:** `activate` or `confirm`, for a user whose secret was sealed with a key since removed from `keys` — or with a key another deployment has and this one does not.
**Why:** each sealed secret names its key. The first key seals, every key opens, and a secret is sealed again under the first key only the next time a code of that user is accepted. A user who has not signed in since the rotation still holds the old seal.
**Fix:** put the old key back, after the new one:

```ts
secondFactor: {
  issuer: 'Acme',
  keys: [
    { id: 'k2026b', key: process.env.TOTP_KEY_K2026B ?? '' }, // seals
    { id: 'k2026a', key: process.env.TOTP_KEY_K2026A ?? '' }, // still opens
  ],
},
```

A key can go once no stored second-factor secret starts with `v1.<its id>.`.

### `<call>: the secret does not open with the key "<id>" — was that key changed under the same id, or the secret copied from another user?`

A `TypeError`.

**When:** `activate` or `confirm`.
**Why:** the key held under that id is not the one that sealed the secret: its value was changed and its id kept, or two environments sharing one database hold different keys under one id. It is also the message for a sealed secret copied onto another user — a seal is bound to the user's id — for example a user record duplicated by hand.
**Fix:** restore the original key under that id. A new key always takes a new id. For a copied record, disable the factor and have the user enroll again: `await auth.secondFactor.disable(user)`.

### `<call>: the stored secret is not a sealed one`

A `TypeError`.

**When:** `activate` or `confirm`.
**Why:** the stored secret is not `v1.<key id>.<iv>.<sealed>`: it was written into the store directly — a plain base32 secret imported from another system — or cut short.
**Fix:** never write the second factor into the store yourself. Disable it and have the user enroll again:

```ts
await auth.secondFactor.disable(user);
```

### `<call>: the <type> type does not sign in with a password, so it has no second factor`

A `TypeError`.

**When:** `secondFactor.enroll`, from JavaScript, on a user type without `password`. In TypeScript, `secondFactor` is absent from such a type.
**Why:** a second factor is asked for after a password. A type that signs in otherwise has nothing to ask it after, and no login to show in the app.
**Fix:** enroll only users of a type with `password: { login }`.

---

## Sign-in codes

The messages start with `signInCode.confirm` — prefixed by the type with
several user types: `patient.signInCode.confirm: …`. `signInCode.request`
throws nothing but `STORE_FAILED`: an e-mail it cannot sign in is `null`.
`signInCode.confirm` also rejects with
[`CODE_INVALID`](#code_invalid--call-the-code-does-not-match-or-was-already-used),
[`TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`](#token_unknown-token_spent-token_expired),
[`USER_INACTIVE`](#user_inactive--call-the-user-is-inactive) and
[`VERSION_CONFLICT`](#version_conflict--call-expected-version-n-found-m);
each of those entries has a paragraph for it.
[The sign-in code guide](guide/sign-in-code.md) has the whole flow.

### `TOKEN_STALE` — `<call>: the code was sent to an e-mail the user no longer has`

`TokenError`, carrying the `userId`.

**When:** `signInCode.confirm`, after the user's e-mail was changed — by
`update`, or a patch naming the e-mail field — since the code was sent.
**Why:** the code proves an address, and signing in with it would mark as
verified an address the user no longer holds. The challenge is spent.
**Fix:** answer 400, and request a new code: it goes to the current address.

```ts
const issued = await auth.signInCode.request(currentEmail);
```

### The code from an earlier e-mail is refused with `CODE_INVALID`

**When:** the visitor asked for a code twice — pressed "send again", or
opened the form in two tabs — and typed the code of the first e-mail.
**Why:** every `request` issues a new code **with its own challenge**, and a
code is checked against the challenge it was sent with. The cookie or the
form field now holds the second challenge, so the first code does not
match it — and costs an attempt.
**Fix:** tell the visitor that only the last code sent works, and put the
time it was sent in the e-mail's subject or text so they can tell the
e-mails apart. The earlier challenge is spent by the new `request`: the
first code, even with its own challenge, answers `TOKEN_SPENT`.

### `signInCode.request` answers `null` for a user who exists

**When:** `signInCode.request(email)`, for an address you can see in the
database.
**Why**, in the order to check:

1. **The user is inactive.** An inactive user gets no code, and the answer
   is the same as for nobody.
2. **It is another user type.** `clinic.patient.signInCode.request` looks
   among patients only; the same address may hold a user of another type.
3. **The address is not the type's e-mail field.** A type whose `email`
   option names `contact` is looked up by `contact`. A login that looks like
   an e-mail — a `username` of `ada@example.com` — is not an e-mail, and is
   `null` too.

The e-mail is trimmed and lowercased before the lookup, so case and
surrounding spaces are never the cause.
**Fix:** `setActive(user, true)`; call the right type's `signInCode`; name
the field with `email: 'contact'`. Do not tell the visitor which case it
was — the route answers the same page either way.

### `TS2339: Property 'signInCode' does not exist on type 'TypeApi<…>'.`

Also `Property 'signInCode' does not exist on type 'Janus<…>'.`, with the
single-type form, `janus({ user })`.

**When:** `tsc`, on `auth.signInCode` or `clinic.<type>.signInCode`.
**Why:** the user type has no e-mail: no field called `email`, and no
`email` option naming one. A code has nowhere to be sent, so the flow is
absent from the type.
**Fix:** name the field that holds the e-mail:

```ts
janus({
  users: {
    staff: { schema: Staff, password: { login: 'username' }, email: 'workEmail' },
  },
  ...
});
```

---

## User events

### `[JANUS_EVENT_FAILED] Warning: janus: the events listener failed on <type> <event id> for user <user id>: <name>`

A process warning, not a thrown error: the flow that sent the event answered as if nothing happened.

**When:** the function given to `janus({ events })` threw or rejected — a queue that was down, a bug in the listener.
**Why:** the write the event reports has landed. Failing the flow would tell the visitor it did not happen, and their retry would hit `LOGIN_TAKEN`. So the failure is warned about, with the event's type, its id and the user's id, and the failure's name — never its message, which may hold anything.
**Fix:** make the listener only store the event (a queue, an outbox table) and fix whatever refused it. To send the lost event again, rebuild it from the warning — its type, its `id`, the user's id; the warning has no `occurredAt`, so take the user's `updatedAt` (or the warning's own time) as an approximation:

```ts
process.on('warning', (warning) => {
  if ((warning as { code?: string }).code === 'JANUS_EVENT_FAILED') logger.error(warning.message);
});
```

### An event you expected never arrived

**When:** a `user.emailVerified` after a confirm, a `user.deleted` after a delete, a `user.created` from a sign-up.
**Why:** one of these, in order of likelihood:
- the e-mail was already verified: nothing changed, so nothing is sent;
- `delete` deleted nobody — a replay, or an id of another user type;
- the flow was refused, or the store failed during the write itself — the call threw, and nothing was written or sent;
- the process stopped between the write and the listener — events are sent at most once, from memory;
- the listener threw: look for `JANUS_EVENT_FAILED` in the process's warnings.

**Fix:** for the last two, reconcile against the users themselves and treat events as the fast path, not the record: page through `auth.list()` and compare with the receiver's copy — a user it lacks is a missed `user.created`, a user the receiver has that `auth.find` answers `null` for is a missed `user.deleted`, and a user whose `emailVerified` differs is a missed `user.emailVerified`.

A store outage **after** the write does not lose the event: it is sent right after the write it reports, before the steps that follow — the sessions `delete` removes, the sessions a reset revokes.

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
await access.can(grace, 'view', { type: 'record', ...record });
```

### `can: <type>.<name> reaches a condition, and no ctx was passed — pass { ctx }`

Also `list: <type>.<name> reaches a condition, and no ctx was passed — pass { ctx }`.

**When:** `can` or `list`, when a rule reached by the check is a `when(...)`.
**Why:** a condition runs on the `ctx` you pass. A missing `ctx` is a caller's bug, not a denial.
**Fix:**

```ts
await access.can(grace, 'edit', { type: 'record', ...record }, { ctx: { onShift: true } });
```

### `list: <type>.<relation> is read from a field, and has no lookup to find the <type>s naming <id> — …`

**When:** `access.list(subject, permission, type)` through a `fromField` relation.
**Why:** `list()` walks backwards from the subject, so it cannot read a field of objects it has not found yet. It asks your `lookup` for the ids of the objects whose field names the subject.
**Fix:**

```ts
doctors: fromField('doctorId', 'staff', { lookup: (staffId) => db.records.idsByDoctor(staffId) }),
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
**Why:** the model's relation does not admit that kind of subject: `members: ['staff']` refuses a `patient`, and refuses the subject set `team#members` unless it is listed.
**Fix:** grant a subject the relation admits, or add the holder to the model: `members: ['staff', 'team#members']`.
With `revoke:` on a tuple stored before the model stopped admitting it, the tuple already grants nothing; remove it through the store: `relations.write({ remove: [tuple] })`.

### Other `can:`, `list:`, `grant:` and `revoke:` messages

Each is a `TypeError` naming the call. TypeScript refuses most of them on the argument first.

| Message | Fix |
| --- | --- |
| `can: "<name>" is not a relation or a permission of <type>` | Ask a name the type declares. |
| `<call>: "<type>" is not an object type of the model` | Use a type declared under `types`. Also for a subject set — `setOf` included — whose type is neither a user type nor an object type. |
| `<call>: the object must be { type, id, …its fields }` | `{ type: 'record', ...record }`. |
| `<call>: the subject must be a user, or { type, id }` | Pass the user from `janus()`, or `{ type, id }`. `null` is anonymous and answers `false`. |
| `<call>: the object id must be a non-empty string without @, # or parentheses` | Also for `the subject id`. Those characters belong to the tuple notation. |
| `<call>: "<relation>" is not a relation of <type>, so <type>#<relation> is no subject set` | A subject set names a relation of its type: `{ type: 'team', id, relation: 'members' }`. |
| `<call>: <type> is a user type the model does not declare as an object type, so <type>#<relation> is no subject set` | `setOf(user, relation)` names a relation on that user: declare the user type under `types` too, with that relation — see [permissions on a user](guide/permissions.md#permissions-on-a-user). The compiler refuses it first. |
| `grant: "<relation>" is not a relation of <type>` | Grant a relation, never a permission. |
| `list: the type must be an object type of the model` | The third argument is a type name: `'record'`. |
| `list: after must be the nextCursor of a page, or null` | Pass `nextCursor` back as it came. |

### `defineModel: …`

`defineModel` refuses with a `TypeError` what only running it can see. The
most common:

| Message | Fix |
| --- | --- |
| `defineModel: types.<type>.relations is now related: rename the key` | The key before 0.2. Rename it, nothing else: `related: { members: ['staff'] }`. The compiler refuses it first: `team.relations is now related: rename the key`. |
| `defineModel: types.<type>.permissions is now permits: rename the key` | The same for the permissions: `permits: { view: ['members'] }`. The compiler refuses it first: `team.permissions is now permits: rename the key`. |
| `defineModel: types.<type>.<key> is not a key of an object type: related or permits` | An object type has two keys, `related` and `permits` — `permit:`, singular, is a typo. |
| `defineModel: subjects must be an array of subject type names — auth.types from janus(), or your own` | `defineModel({ subjects: auth.types, types })` with `janus()`, or your own names alone: `subjects: ['user']`. |
| `defineModel: types declares no object type` | Declare at least one type under `types`. |
| `defineModel: types.<type> must be an object` | Also `types.<type>.related must be an object` and `types.<type>.permits must be an object`: each is keyed by name — `related: { members: ['staff'] }`. |
| `defineModel: the object type "<name>" must be a camelCase name — letters and digits, starting with a lowercase letter` | Also `types.<type>.related: "<name>" must be a camelCase name — …` for a relation, and `types.<type>.permits: …` for a permission. |
| `defineModel: types.<type>: "<name>" names a relation and a permission; rename one` | One name, one meaning. |
| `defineModel: types.<type>.related.<relation> must be a non-empty array of subject types, or fromField()` | `members: ['staff']`, or `doctors: fromField('doctorId', 'staff')`. |
| `defineModel: types.<type>.related.<relation>: "<holder>" is not a subject type` | Also `"<holder>" is not a subject set — it must name an object type and one of its relations`: `'team#members'`, a declared type and one of its relations. |
| `defineModel: types.<type>.permits.<permission> must be a non-empty array of rules` | `view: ['members']`. |
| `defineModel: pass { subjects, types }` | From JavaScript: `defineModel` was given something other than an object. |
| `defineModel: the subject type "<name>" must be a camelCase name` | A user type from `janus()` is always one; check a list of your own. |
| `defineModel: types.<type>.related.<relation>: fromField names "<name>", which is not a subject type` | `fromField('doctorId', 'staff')`: the second argument is a user type or an object type of the model. |
| `defineModel: types.<type>.related.<relation>: fromField must name a top-level field` | `fromField('doctorId', …)`, never `'doctor.id'`: the field is read from the object passed to `can()`. |
| `defineModel: types.<type>.related.<relation>: fromField's lookup must be a function` | `{ lookup: (staffId) => db.records.idsByDoctor(staffId) }`. |
| `defineModel: types.<type>.related.<relation>: a holder must be a string` | `members: ['staff', 'team#members']`. |
| `defineModel: types.<type>.permits.<permission>[<i>]: a rule is a name, an arrow, or when()` | `view: ['doctors', 'teams->view', when('doctors', test)]`. |
| `defineModel: types.<type>.permits.<permission>[<i>]: when() takes a function as its test` | `when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)`. |
| `defineModel: types.<type>.permits.<permission>[<i>]: "<rule>" is not a relation or a permission of <type>` | Name a relation or a permission the type declares — `'members'`, `'manage'`. |
| `defineModel: types.<type>.permits: <a> → <b> → <a> is a loop no relation ends` | A permission must cross a relation before it reaches itself again. |
| `defineModel: … "<rule>" goes through "<relation>", which is not a relation of <type>` | An arrow starts from a relation of the same type: `'teams->view'` needs `teams` under `related`. |
| `defineModel: … "<rule>" goes through "<relation>", which can hold a subject set; an arrow follows object types only` — also `which can hold a <user type>` | An arrow's relation must hold object types: `teams: ['team']`. A user has no permissions to follow. The compiler refuses it first. |
| `defineModel: … "<rule>" names "<target>", which <type> does not declare` | Arrow to a relation or permission of the target type. |
| `defineModel: … reads <type>.<field>, and a subject set reaches <type>s nobody passed to can() — store that relation instead of reading it` | Only the object passed to `can()` carries data: a `fromField` there cannot be reached through a subject set or an arrow. Store it as a tuple. |
| `defineModel: types.<type>.permits.<permission>: "<relation>-><target>" reaches <type>.<target>, which reads <type>.<field>, and only the object passed to can() carries its data — store that relation instead of reading it` | The same through an arrow: `'teams->leads'` where the team's `leads` is a `fromField`. Store it as a tuple. |

---

## Subjects

### `parseTuple: "<text>" is not a relation tuple; expected type:id#relation@subject`

Also `parseSubject: "<text>" is not a subject; expected type:id, or type:id#relation for a subject set`.

**When:** `parseTuple(...)` or `parseSubject(...)`, a `TypeError`.
**Why:** subjects are typed. `team:t1#members@grace` — Keto's untyped subject — is refused. No part may hold `@`, `#` or a parenthesis, and a type may not hold `:`.
**Fix:**

```ts
import { parseTuple } from '@nxgt/janus';

parseTuple('record:r1#teams@team:t1');
parseTuple('team:t1#members@team:t2#members');
```

### `setOf: pass a user or { type, id }, then a relation`

Also `setOf: the relation must be a non-empty string`.

**When:** `setOf(...)`, a `TypeError`.
**Why:** a set is everyone holding one relation on one user or object: it needs both.
**Fix:**

```ts
import { setOf } from '@nxgt/janus';

setOf(bob, 'managers');                          // a user from janus()
setOf({ type: 'team', id: 't1' }, 'members');    // an object
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
