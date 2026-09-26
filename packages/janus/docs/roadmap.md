# Roadmap

Where `@nxgt/janus` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

Nothing between releases.

## Next

- **Confirm an action with an e-mailed code (step-up)** — a signed-in user
  proves they still read their inbox before something a stolen session should
  not do alone: changing the e-mail, disabling the second factor, deleting
  the account. The same six digits, challenge and five attempts as a sign-in
  code, bound to the session that asked rather than opening one — which
  takes a token kind of its own, so a sign-in code can never confirm an
  action nor an action's code sign anyone in.
- **Recovery codes** — single-use codes for the TOTP second factor, so a
  user who loses their authenticator app can still sign in, without an
  operator resetting the account.
- **Sending the e-mails** — in a package of its own, `@nxgt/janus-mail`, built
  on a general mail toolkit shared with applications that are not about
  sign-in: a `Mailer` port you plug your transport into (SMTP, Resend, SES…) —
  a transport that fails throws, like a store — and default templates for
  verification, password reset and one-time codes, in English and French. One
  template per e-mail, never one HTML file per language: the layout is built
  once with Maizzle and Tailwind CSS 4 — CSS inlined for mail clients — and
  its text lives in ICU message catalogues, one per language, plurals and
  dates included. Both are compiled when the package is built into typed
  functions: `templates.verifyEmail({ locale: 'fr', link })` answers
  `{ subject, html, text }`, every value escaped, a missing variable or an
  unknown locale a compile error, a message that fails to format a throw —
  never an e-mail sent with `{link}` in it. No template engine at run time.
  The defaults are a starting point, not a requirement: add a language with a
  catalogue, or replace any one template with your own function of the same
  shape — built with the same toolkit, React Email or a plain string — and
  keep the defaults for the rest.
- **Webhooks** — signed HTTP events when something happens to a user
  (created, e-mail verified, password reset, deleted), so another service can
  follow without polling: a signature it can check, retries on failure, and
  the same rule as the audit trail — the user named by id, never a login, a
  password, a session token or a one-time token in a payload, and every key
  camelCase. Retries that run out are reported, never dropped in silence.

## Later

- **More official adapters** — the ports are cut where atomicity is not
  required, so users, sessions and permission tuples can each live in the
  database that suits them. MongoDB is the first adapter
  ([`@nxgt/janus-mongo`](https://www.npmjs.com/package/@nxgt/janus-mongo)),
  PostgreSQL and Redis followed
  ([`@nxgt/janus-drizzle`](https://www.npmjs.com/package/@nxgt/janus-drizzle),
  [`@nxgt/janus-redis`](https://www.npmjs.com/package/@nxgt/janus-redis)).

## Not planned

- **`moduleResolution: "nodenext"`** — the package, its sources and its
  emitted declarations import without extensions, and resolve as Bun and every
  bundler do. Rewriting the declarations for `nodenext` was tried and reverted:
  it breaks the same contract one step later. Use `"moduleResolution":
  "bundler"`.
- **A Kratos-shaped surface** — no `identity.traits`, no login derived from a
  schema annotation (Kratos's `identifier`). A user is your schema's fields at the top level,
  and the flows are calls (`signUp`, `signIn`, `authenticate`).
- **`snake_case` keys** — every key, option and record field is `camelCase`,
  and a lint rule holds it. Error codes are `SCREAMING_SNAKE` because they are
  values, not keys.
- **Emitting a Kratos identity schema** — it would bring Ory's `snake_case`
  vocabulary into this package. If it ever exists, it is a separate package
  whose job is to speak that format.
- **A `total` on `CursorPage`** — a count over a cursor-paged collection is a
  second query, stale by the time you read it. `nextCursor` is the loop.
- **Store-assigned or numeric ids** — ids are UUIDv7 minted by the core, so
  they sort in creation order, the cursor is the last id, and an insert is
  idempotent under retry. An adapter cannot reuse an existing numeric key.
- **A required validation library** — schemas are any Standard Schema (Zod 4,
  Valibot, ArkType); none is imposed as a peer.
- **A silent hasher fallback** — a user type with a password and no `hasher`
  is refused at wiring, rather than hashed with something you did not choose.
- **Answering `null` or `false` on an outage** — a store that cannot answer
  throws `STORE_FAILED`, and a permission walk past `maxDepth` throws
  `PERMISSION_DEPTH`. Neither will become a denial: that turns an outage into
  a silent lockout.
- **Zanzibar's infrastructure** — no consistency tokens, no distributed
  cache. The tuples live in your own database, so a read already follows a
  write.
- **Deciding between 404 and 403** — `can()` answers one question; what a
  route reveals about an object it refuses is the application's decision.

## Shipped

The last ten, newest first, each with the version it came in. Everything
before is in the [CHANGELOG](../CHANGELOG.md).

- **One sign-in code live per user, and challenges that end when they
  should, v0.7.0** — `signInCode.request` spends the codes sent before, so
  only the last e-mail's works; a password reset spends the second-factor
  challenges left waiting; another user type's `confirm` spends a challenge
  at its fifth attempt; `verifyEmail.confirm` and `resetPassword.confirm`
  check the e-mail again on the record they write. `SecondFactorRequired`
  carries `userId`, for logs and rate limits. For adapters:
  `TokenStore.spendUserTokens(userId, kind, at)`, with three new conformance
  cases, implemented in `@nxgt/janus-drizzle`, `@nxgt/janus-mongo` and
  `@nxgt/janus-redis`.
- **Sign in with a code sent by e-mail, v0.6.0** —
  `auth.<type>.signInCode.request(email)` answers a six-digit code to send
  and a challenge to keep with the visitor, or `null` for nobody — never
  saying which; `signInCode.confirm(challenge, code)` marks the e-mail
  verified and opens the session. On every user type with an e-mail, one
  without a password included; an active second factor is still asked for.
  A challenge lives ten minutes (`tokens.signInCode`) and takes five
  attempts, and only the code's hash is stored, keyed by the challenge.
- **A TOTP second factor, v0.5.0** — `janus({ secondFactor: { issuer, keys } })`
  and `auth.<type>.secondFactor`'s `enroll`, `activate`, `disable` and
  `confirm`, for every user type with a password; each secret sealed with
  AES-256-GCM under keys your application holds, and rotated by adding a key.
  Breaking once configured: `signIn` answers `{ status: 'signedIn', … }` or
  `{ status: 'secondFactor', challenge, expiresAt }`. A challenge lives five
  minutes and takes five attempts, a code is accepted once, and a refused one
  throws `CODE_INVALID` with `attemptsLeft`.
- **The store port holds a second factor and counts attempts on a token,
  v0.4.0** — `UserRecord.secondFactor`, a token's `codeHash` and `attempts`,
  the token kinds `'secondFactor'` and `'signInCode'`, and
  `TokenStore.countAttempt`, one conditional write per attempt, with six new
  conformance cases. The published adapters implement them in
  `@nxgt/janus-drizzle` 0.2, `@nxgt/janus-mongo` 0.3 and
  `@nxgt/janus-redis` 0.2.
- **Permissions on a user, v0.3.0** — a user type may also be an object type:
  a staff member is the object `can()` asks about and is granted relations
  on, like a record, and `grant(note, 'readers', setOf(bob, 'managers'))`
  grants everyone who manages bob at once. A user
  passed as it is stays that user, even with a field named `relation`.
- **The adapters and the kit, each at its first release, v0.1.0, beside
  `@nxgt/janus` 0.2.2** —
  [`@nxgt/janus-drizzle`](https://www.npmjs.com/package/@nxgt/janus-drizzle),
  both sides over one PostgreSQL database on Drizzle;
  [`@nxgt/janus-redis`](https://www.npmjs.com/package/@nxgt/janus-redis),
  sessions and one-time tokens in Redis, expired by Redis itself;
  [`@nxgt/janus-telemetry`](https://www.npmjs.com/package/@nxgt/janus-telemetry),
  a span per flow and per permission check, and the security events worth an
  audit trail, never a login, a password, a session token or a one-time token;
  and [`@nxgt/janus-kit`](https://www.npmjs.com/package/@nxgt/janus-kit), all
  of it wired in one call.
- **A NUL character or a lone surrogate never reaches a store** — refused in
  fields with `USER_INVALID` on every adapter, rather than `STORE_FAILED` on
  PostgreSQL alone; a login holding one is nobody's. The conformance suite
  holds every adapter to round-tripping every other character. — v0.2.1
- **The model's keys read `related` and `permits`** — Keto's OPL words: an
  object type declares `related: { members: ['staff', 'team#members'] }` and
  `permits: { view: ['members'] }`, and relation names are plural by convention. Breaking:
  `relations` and `permissions` as keys are refused, by the compiler and by
  `defineModel`, with a message naming the new key —
  `types.team.relations is now related: rename the key`. The `permissions()`
  function and `janus({ relations })` keep their names. — v0.2.0
- **`LOGIN_TAKEN` no longer quotes the login in its message**, in the memory
  store and in both adapters; `error.login` still names it, and the
  conformance suite checks it. — v0.2.0
- **The conformance suite accepts a store with its own expiry** — a store
  that drops a lapsed session at once, as a Redis TTL does, passes
  `sessions.deleteUser`; one that still holds it must count it. — v0.2.0