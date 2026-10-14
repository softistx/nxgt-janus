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
  per window, and the mail throttle one per flow per address or user per
  window. A port method to collect them, as sessions are, would let the
  core do it.

- **A batch read across types** — `findMany` reads one user type, as `find`
  does. The shared `findUser(id)` has no batch counterpart yet; one on the
  instance, answering a union narrowed by `user.type`, would serve a list that
  mixes types.

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

- **Finding a user, or creating them** —
  `auth.<type>.findOrCreate(key, input)` answers `{ user, created }`: the
  holder of the key — the login on a type with a password, the e-mail on one
  without — or the user `input()` describes, created as `create` creates
  one. `input` runs only on an absence and may refuse before any write; it
  must name the key, or the call is `USER_INVALID`; a lost race is
  answered with the winner, `created: false`. It is the accept step of an
  invitation in one call. Server-side only.
- **Changing a user's e-mail, v0.23.0** —
  `auth.<type>.changeEmail.send(user, email)` issues a link for the new
  address, and `changeEmail.confirm(token)` moves the user there, verified,
  keeping the password, the second factor and the sessions. The address is
  validated as `update` does and never checked for a holder at `send`;
  `confirm` answers `LOGIN_TAKEN` with the token spent. Throttled per user
  and per new address; a link lives an hour (`tokens.changeEmail`); a newer
  `send` spends the earlier links, and so does an `update` that moves the
  e-mail, so moving back revives none. `user.emailChanged` carries `formerEmail` so the
  former address can be told. Gate `send` behind a fresh sign-in or a
  step-up. **Breaking for an adapter: `TokenKind` gains `'changeEmail'`**,
  which a `CHECK` or a validator's enum must list — the janus-drizzle 0.8
  migration, the janus-mongo 0.9 sync.
- **Proving an e-mail on the application's own proof, v0.22.0** —
  `auth.<type>.verifyEmail.proveFirst(user)` applies the first proof of an
  e-mail that a sign-in link or code applies — verified, the password and
  the second factor dropped, every session revoked — when the proof is the
  application's, such as an invitation token mailed to the address. An
  e-mail already proved changes nothing; the answer says which,
  `{ user, proved }`. Nothing is counted, sent or issued. An invitation is
  accepted in this order: find or create, `proveFirst`, `setPassword`,
  `signInProven`. Privileged: never with an id a request supplied.
- **Finding a user by e-mail on every type, v0.21.0** —
  `auth.<type>.findByEmail(email)` answers the user of the type holding the
  address, or `null`, on every type with an e-mail — a type with no
  password included, which has no `findByLogin`. The address is normalised
  and compared as the e-mail flows do; nothing is counted, issued or
  written. It is the lookup before `signInProven` when an invitation holds
  an address. Server-side only: it tells whether an account exists.
- **Signing in on the application's own proof, v0.20.0** —
  `auth.<type>.signInProven(user, { device })` signs in a user the
  application proved itself — an invitation token it issued — and answers
  what every sign-in answers: a session, or a second-factor challenge, with
  the device and `USER_INACTIVE` handled alike. It sends no e-mail, counts
  in no throttle and spends no link already sent, so accepting an
  invitation no longer goes through `magicLink.request` and its mail
  throttle. Privileged: never with an id a request supplied.
- **E-mail requests in two steps, v0.20.0** — `magicLink.prepare(email)`,
  `signInCode.prepare(email)` and `resetPassword.prepare(email)` count the
  address and look nobody up — the same work for any address — so
  `MAIL_THROTTLED` reaches the visitor while `send()`, the lookup and the
  issue, runs off their request, where its time tells nothing. `send()`
  answers what `request` does, once; a second call is a `TypeError`. A sign-in
  code's prepared request carries its `challenge`, minted before the lookup,
  so no decoy is needed for an address nobody holds.
- **Several users by id in one query, v0.19.0** — `auth.<type>.findMany(ids)`
  answers the type's users in the order of `ids`, each once, and leaves out an
  id nobody of that type holds — for a list of rows that would otherwise make
  one `find` per row and fill the connection pool. The users store gains an
  optional `findUsers`, implemented by the reference store,
  `@nxgt/janus-drizzle` 0.7.0 and `@nxgt/janus-mongo` 0.8.0; a store without it
  is read with `findUser`, ten at a time, so third-party adapters keep working.
- **Requests that send e-mail are throttled, v0.18.0** —
  `janus({ mail: { throttle: { attempts, window } } })`, five per ten
  minutes by default and `false` to turn it off. `magicLink.request`,
  `signInCode.request` and `resetPassword.request` count per address;
  `verifyEmail.send` and an e-mailed `stepUp.request` count per user; each
  flow on its own. Past the limit a request throws `MailThrottledError`
  (`MAIL_THROTTLED`, 429) with `retryAfter` and issues, spends and rotates
  nothing: the last link or code sent still works, so a loop on an address
  cannot lock its owner out.
  The window is no longer than the shortest default token lifetime. The counts
  live in the tokens store, with no port change. `MailConfig` and
  `MailThrottleConfig` are exported.
- **A sign-in from a new device, v0.17.0** — `janus({ devices: { keys } })`,
  and `{ device }` as the last argument of `signUp`, `signIn`,
  `secondFactor.confirm`, `secondFactor.recover`, `signInCode.confirm` and
  `magicLink.confirm`: the device token the client holds, or `null`. Every
  answer that opens a session says `newDevice` and hands back a
  `deviceToken` for a long-lived cookie, and a new device sends
  `user.newDeviceSignedIn`, with the new session's `sessionId`, once the
  sign-in is complete. Nothing is stored: the token is a device id signed
  for the user, so the store ports are unchanged. A sign-up is never new, a
  call given no device is not tracked, and removing a key forgets every
  device it signed. Breaking for a `switch` that exhausts `UserEventType`,
  and for a `SignedIn` built by hand. See [devices](guide/devices.md).
- **The first sign-in by link or code ends a squatter's password and second
  factor, v0.16.0** — when `signInCode.confirm` or `magicLink.confirm`
  proves an e-mail never verified, the password and the second factor with
  its recovery codes are dropped and every session signed out before the
  new one opens: whoever registered the address without its inbox keeps
  nothing, and the owner is asked for no factor they never set.
  `user.passwordChanged` and `user.secondFactorDisabled` report what was
  dropped. An e-mail already verified changes nothing.
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
