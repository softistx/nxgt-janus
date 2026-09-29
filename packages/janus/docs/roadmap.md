# Roadmap

Where `@nxgt/janus` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

Nothing between releases.

## Next

Nothing yet.

## Later

- **Collecting lapsed one-time tokens** — `collectExpired()` deletes lapsed
  sessions only. On a store with no TTL (PostgreSQL), lapsed tokens stay
  until you delete them, and the sign-in throttle adds one per login tried
  per window. A port method to collect them, as sessions are, would let the
  core do it.

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
- **An account lockout** — a login past its attempts waits for the next
  window, and no number of wrong passwords blocks an account for longer:
  a lockout would let anyone lock anyone out.
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

- **Sign in with an e-mailed link (magic link), v0.15.0** —
  `auth.magicLink.request(email)` and `magicLink.confirm(token)` on every
  user type with an e-mail, with or without a password: the sign-in code
  with nothing to type. `request` answers `null` for nobody and for an
  inactive user alike; only the last link sent works; a link lives fifteen
  minutes (`tokens.magicLink`) and is spent by its first `confirm`, which
  proves the e-mail and still asks for an active second factor. Confirmed
  from a `POST`, so a mail scanner that opens the link spends nothing.
  **Breaking for an adapter: `TokenKind` gains `'magicLink'`**, which a
  `CHECK` or a validator's enum must list.
- **Password guessing throttled per login, v0.14.0** — past ten passwords
  tried at one login in a 15-minute window, `signIn` answers
  `CREDENTIALS_INVALID` with `reason: 'throttled'` and `retryAfter`, the right
  password included, until the window ends. Nothing locks; a login nobody
  holds is counted alike; a password sign-in that opens a session —
  after its second factor, when one is active — starts the count again.
  On by default: `signIn: { throttle: { attempts, window } }` changes it,
  `signIn: { throttle: false }` turns it off. A tokens store that cannot
  count fails the sign-in with `STORE_FAILED`. No change for adapters: the
  counts are `secondFactor` tokens, counted by `TokenStore.countAttempt`.
- **A password or an e-mail changed, in the user events, v0.14.0** —
  `user.passwordChanged`, sent by `changePassword` and `setPassword` once the
  older reset links are spent (a reset stays `user.passwordReset` alone), and
  `user.emailChanged`, sent by an `update` that changed the e-mail, carrying
  `formerEmail` — the one event with more than the user's id — so a notice
  can reach the inbox the account just left, as `@nxgt/janus-mail`'s
  `passwordChanged` and `emailChanged` notices do. Breaking for a `switch`
  that exhausts `UserEventType`.
- **An old reset link stops working, v0.13.0** — `resetPassword.request`
  spends the links sent before, so only the last e-mail's works, and writing
  a password — a link's `confirm`, `changePassword`, `setPassword` — spends
  every reset link still live, so a link sent before the change cannot
  replace the new password. Both answer `TOKEN_SPENT`; an outage spending
  them fails the call with `STORE_FAILED`. No change for adapters: the
  existing `TokenStore.spendUserTokens` does it.
- **Confirm an action with a code (step-up), v0.12.0** —
  `auth.stepUp.request(user)` and `stepUp.confirm(request, challenge, code)`:
  a signed-in user proves again who they are before a sensitive action, with
  a six-digit code sent by e-mail — or, when their second factor is active,
  the code from their app. The confirmation moves the session's
  `authenticatedAt` and opens no session, and `assertFresh(session, maxAge)`
  refuses an older one with `STEP_UP_REQUIRED` (403). A token kind of its
  own, `stepUp`, and `SessionStore.reauthenticateSession`, in the three
  adapters and the conformance suite.
- **The recovery codes left, read again, v0.11.0** —
  `secondFactor.recoveryCodesLeft(user)` answers the count `recover`
  answered, for a `user.recoveryCodeUsed` listener — the event names the
  user only — or a security settings page; `null` for a user with no active
  factor. The listener can now tell the user how many codes remain, as
  `@nxgt/janus-mail`'s `recoveryCodeUsed` e-mail does.
- **Recovery codes, v0.10.0** — a user who loses their authenticator app
  still signs in, with no operator resetting the account.
  `secondFactor.activate` answers `{ user, recoveryCodes }`: ten single-use
  codes, shown once and stored only as keyed hashes (breaking: read `.user`).
  `secondFactor.recover(challenge, code)` redeems a sign-in's challenge with
  one and answers the session with `recoveryCodesLeft`;
  `secondFactor.regenerateRecoveryCodes(user, code)` replaces them all on a
  fresh code from the app, and counts its attempts itself — five per user
  per 15-minute window, in the store — so a stolen session cannot guess the
  code, and the route needs no limiter of its own. Two user events,
  `user.recoveryCodesRegenerated` and `user.recoveryCodeUsed`. For adapters:
  `SecondFactorRecord.recoveryCodes`,
  stored by the users stores of `@nxgt/janus-drizzle` and
  `@nxgt/janus-mongo`, with conformance cases.
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
