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

- **The second factor in the user events, v0.9.0** —
  `user.secondFactorEnabled`, once `secondFactor.activate` made a factor
  active, and `user.secondFactorDisabled`, once `secondFactor.disable`
  removed an active one: a listener can tell the user, as
  `@nxgt/janus-mail`'s `twoFactorEnabled` and `twoFactorDisabled` notices
  do, whoever made the change. `enroll`, a factor still waiting, and a
  `disable` that found none send nothing.
- **Sending the e-mails, `@nxgt/janus-mail` v0.1.0** — a package of its
  own, built on the `@nxgt/mail` toolkit: `janusMail({ mailer, from, brand,
  links })` takes what each flow answers —
  `await mail.verifyEmail(await auth.verifyEmail.send(user), { name, locale })`
  — and sends five e-mails, in English and French, over any `@nxgt/mail`
  transport: e-mail verification, password reset, sign-in code, and the
  notices *password changed* and *e-mail changed*. They are built once with
  Maizzle when the package is built, and only filled in at send time, every
  value escaped: no template engine in your server. A transport that fails
  throws, like a store.
- **A permission id no store can keep is held by nobody** — an object or
  subject id holding a NUL character or a lone surrogate answers `false` from
  `can()` and an empty page from `list()`, before any store call, and a
  `fromField` holding one names nobody, nor does a `lookup` answering one;
  `grant()` and `revoke()` refuse it with a `TypeError` rather than
  `STORE_FAILED` on PostgreSQL alone. The relation store suite holds every
  adapter to reading back every other character in an id exactly as written.
  — v0.8.3
- **Webhooks, `@nxgt/janus-webhooks` v0.1.0** — a package of its own: the
  user events `janus({ events })` hands over, signed by the Standard
  Webhooks specification (HMAC-SHA256, secrets that rotate) and posted to
  your endpoints, retried with backoff, and reported to `onGivingUp` when
  given up — never dropped in silence. `verifyWebhook` is the receiving side.
- **User events, v0.8.0** — `janus({ events })` takes one listener, called
  with `user.created`, `user.emailVerified`, `user.passwordReset` and
  `user.deleted` once the write landed, and awaited before the flow answers.
  An event names the user by id alone, with a UUIDv7 of its own to deliver
  it once; a listener that throws fails no flow and is a
  `JANUS_EVENT_FAILED` warning.
- **At most one sign-in code live per user, and challenges that end when
  they should, v0.7.0** — `signInCode.request` spends the codes sent before,
  even when requests race, so only the last e-mail's works; writing a
  password spends the second-factor challenges left waiting, and a sign-in
  still running when it lands is refused; another user type's `confirm` spends a challenge
  at its fifth attempt; `verifyEmail.confirm` and `resetPassword.confirm`
  check the e-mail again on the record they write. `SecondFactorRequired`
  carries `userId`, for logs and rate limits. For adapters:
  `TokenStore.spendUserTokens(userId, kind, at, except?)`, with four new conformance
  cases, implemented in `@nxgt/janus-drizzle`, `@nxgt/janus-mongo` and
  `@nxgt/janus-redis` — and the port now says a read sees every write that
  completed before it: never a secondary or a read replica.
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
