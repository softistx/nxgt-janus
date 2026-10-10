# @nxgt/janus-graphql

## 0.6.0

### Minor Changes

- [#198](https://github.com/softistx/nxgt-janus/pull/198) [`62a838f`](https://github.com/softistx/nxgt-janus/commit/62a838fe2bbb25743c556c80e7c3bd4bc8a49232) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Behaviour change — the requests that hand out something to e-mail are now throttled, on by default.** Past five requests of one flow in a 10-minute window, `magicLink.request`, `signInCode.request` and `resetPassword.request` — counted **per address**, normalised, whatever the user type — and `verifyEmail.send` and a `stepUp.request` that e-mails a code — counted **per user** — throw `MailThrottledError`, code `MAIL_THROTTLED` (`statusOf` → 429), with `retryAfter`, the seconds until the next window, and **issue nothing**: no token, code or challenge is minted, and **nothing is spent — the last link or code sent still works**, whoever asked for it, so somebody asking for an address in a loop cannot lock its owner out: the owner's last e-mail confirms. The default window, `'10m'`, is no longer than the shortest default token lifetime (`signInCode` and `stepUp`), so under the default lifetimes the last one sent outlives the refusal; a window longer than a lifetime you set leaves a gap. Each flow counts on its own. An address nobody holds is counted before anything is looked up and refused alike past the limit — under it, it still answers `null` — so being throttled never tells who has an account. A step-up confirmed with the app sends nothing and is not counted. Nothing locks: the next window answers again. The message is `<call>: too many e-mails asked for this address — the last one sent still works; use it, or wait for the next window` (or `… for this user — …`): tell the visitor to use the last e-mail they received. One client asking for many addresses is not counted — janus never sees an IP — so keep a per-client ceiling of your own: `@nxgt/redis` 0.5.0 and later has `defineRateLimit` and `bindRateLimit`, whose `enforce()` throws `GuardError` `RATE_LIMITED` with a `retryAfter` in milliseconds. `janus({ mail: { throttle: { attempts, window } } })` changes the limit, and **`mail: { throttle: false }` turns it off** — a test suite that makes more than five of one request for one address or user over a `fixedClock` needs one or the other. The counts live in the tokens store as `secondFactor` tokens named by a keyed hash of the flow and the address or user — no change for adapters; a flushed or evicting Redis forgets them, and on PostgreSQL they add a row per flow, address and window to the lapsed tokens to delete on a schedule. **A tokens store that cannot count now fails those requests with `STORE_FAILED`** (fail closed), and issues nothing. `JanusErrorCode` gains `MAIL_THROTTLED` and `JanusErrorStatus` gains `429`: a `switch` over either that is exhaustive stops compiling until it handles them. New exports: `MailThrottledError`, `MailConfig`, `MailThrottleConfig`. Five new compile-time refusals (152 in all). `@nxgt/janus-hono`: `bodyOf()` answers `{ code: 'MAIL_THROTTLED', retryAfter }` and `janusErrors()` answers 429 with a `Retry-After` header. `@nxgt/janus-graphql`: `janusGraphQLError()` answers status 429, the message `Too many requests, retry later`, `retryAfter` in `extensions` and a `Retry-After` header in `extensions.http.headers`. `@nxgt/janus-telemetry`: `MAIL_THROTTLED` is a refusal, so its span stays `ok`, and a throttled request writes a `janus.mail.throttled` warning with `janus.mail.flow` and `janus.mail.retryAfter` — never the address.

### Patch Changes

- Updated dependencies [[`62a838f`](https://github.com/softistx/nxgt-janus/commit/62a838fe2bbb25743c556c80e7c3bd4bc8a49232), [`9fd9e98`](https://github.com/softistx/nxgt-janus/commit/9fd9e987226994c551ae49b27277f52eba605f03)]:
  - @nxgt/janus@0.18.0

## 0.5.3

### Patch Changes

- [#181](https://github.com/softistx/nxgt-janus/pull/181) [`c0a91ca`](https://github.com/softistx/nxgt-janus/commit/c0a91ca63f7baf8285bc6a73f8cad50410531070) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the context guide shows a sign-in mutation passing janus 0.17's `device` from the request's cookie and setting the answer's `deviceToken` back.
- Updated dependencies [[`c0a91ca`](https://github.com/softistx/nxgt-janus/commit/c0a91ca63f7baf8285bc6a73f8cad50410531070)]:
  - @nxgt/janus@0.17.0

## 0.5.2

### Patch Changes

- Updated dependencies [[`530e301`](https://github.com/softistx/nxgt-janus/commit/530e301eaf523af0b4f1d637e1990564bde70489), [`fba19d4`](https://github.com/softistx/nxgt-janus/commit/fba19d47836fb4dfbe11df7e5a184284082ac061), [`819c954`](https://github.com/softistx/nxgt-janus/commit/819c95494bdefe372284ef25a630c3f601d7765a)]:
  - @nxgt/janus@0.16.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`c69356d`](https://github.com/softistx/nxgt-janus/commit/c69356da514446558f728ac45981aaecef88be1d), [`3468e6b`](https://github.com/softistx/nxgt-janus/commit/3468e6b1e010e2e50cb0e2e0cf299f469aadf906)]:
  - @nxgt/janus@0.15.0

## 0.5.0

### Minor Changes

- [#169](https://github.com/softistx/nxgt-janus/pull/169) [`b3c2487`](https://github.com/softistx/nxgt-janus/commit/b3c248732df07bac2d5ca4e8d218092b491b7b10) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Behaviour change — `signIn` now throttles password guessing, on by default.** Past ten passwords tried at one login in a 15-minute window, `signIn` answers `CREDENTIALS_INVALID` with `reason: 'throttled'` and `retryAfter` — the seconds until the next window — **even for the right password**, until the window ends. Nothing locks: the next window signs in. A login nobody holds is counted as a registered one is, so the throttle does not reveal which logins exist; a password sign-in that opens a session starts the login's count again — with a second factor active, only its code or a recovery code does, so the password alone buys no more than ten challenges per window; the count is taken before anything is compared, so of twenty passwords tried at once exactly ten are. `janus({ signIn: { throttle: { attempts, window } } })` changes the limit, and **`signIn: { throttle: false }` turns it off** — a test suite that tries more than ten wrong passwords at one login over a `fixedClock` needs one or the other. The counts live in the tokens store as `secondFactor` tokens named by a keyed hash of the login — no change for adapters, and a flushed or evicting Redis forgets them. **On PostgreSQL, lapsed tokens are never collected**: every login tried, registered or not, adds a row per window, so schedule `delete from tokens where expires_at < now() - interval '1 hour'` (schema-qualified if your tables have their own schema). Somebody who knows a login can keep its password sign-in shut by trying ten passwords every window; a sign-in code, when wired, still opens it. **A tokens store that cannot count now fails every password sign-in with `STORE_FAILED`** (fail closed), where before `signIn` read no token. `JanusError` gains `retryAfter`, and `CredentialRefusal` gains `'throttled'`: a `switch` over it that is exhaustive stops compiling until it handles it. Six new compile-time refusals (137 in all). This corrects 0.13.0's note that nothing counts failed passwords: `signIn` now counts them per login, and the passwords guide says so; a limiter per client is still yours. `@nxgt/janus-hono`: `bodyOf()` answers a throttled refusal `{ code, retryAfter }` and `janusErrors()` adds a `Retry-After` header. `@nxgt/janus-graphql`: `janusGraphQLError()` puts `retryAfter` in `extensions` and a `Retry-After` header in `extensions.http.headers`. `@nxgt/janus-telemetry`: a throttled sign-in is a `janus.signIn.throttled` warning with `janus.signIn.retryAfter`, instead of `janus.signIn.refused`.

### Patch Changes

- Updated dependencies [[`f171ae3`](https://github.com/softistx/nxgt-janus/commit/f171ae3abed8780e9cf61999daf48a3d2cd192ef), [`b3c2487`](https://github.com/softistx/nxgt-janus/commit/b3c248732df07bac2d5ca4e8d218092b491b7b10)]:
  - @nxgt/janus@0.14.0

## 0.4.0

### Minor Changes

- [#165](https://github.com/softistx/nxgt-janus/pull/165) [`1615f7c`](https://github.com/softistx/nxgt-janus/commit/1615f7c221472fb7be3b3d4dabf4b65d65f70fdf) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The renewed session cookie, and `report` for every outage. Under GraphQL Yoga, `useJanus()` now sends a session `authenticate` renewed in passing back as `Set-Cookie` on the response (Yoga's `onResponse`), so a browser keeps the new expiry and a GraphQL-only application no longer signs out an active user at the expiry written at sign-in. As `@nxgt/janus-hono`'s `session()` does, it is sent only to a request that presented the token as the session cookie — never to `Authorization: Bearer` or `X-Session-Token` — only when a field asked `user()` or `session()`, and never over a session cookie the response already sets; an operation over graphql-ws has no response to carry it. `Auth` takes `cookie` as optional: a wrapper of your own passes `cookie: auth.cookie` on. `janusMaskError({ report, fallback })` calls `report` once with every `JanusError` answered 5xx — `STORE_FAILED`, `UNSUPPORTED`, `PERMISSION_DEPTH` — including the outages `@authenticated`, `@fresh`, `@permission`, `requireUser()`, `requireFresh()` and `can()` answer 503 themselves, which Yoga's logger never sees; a `report` that throws or rejects is a `process.emitWarning` and never changes the answer. `janusMaskError(fallback)`, the fallback alone, still works.

### Patch Changes

- [#164](https://github.com/softistx/nxgt-janus/pull/164) [`1007c85`](https://github.com/softistx/nxgt-janus/commit/1007c857fd445620dedb05a59001a7161b0a833c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the sign-in route (the routes guide of `@nxgt/janus-hono`) and a sign-in mutation (the errors guide of `@nxgt/janus-graphql`) say to rate-limit password guesses per login and per client, with an example — `@nxgt/janus` counts no failed password.
- Updated dependencies [[`fac44ba`](https://github.com/softistx/nxgt-janus/commit/fac44baa935d90c451d05b942c8158606da2f1b2)]:
  - @nxgt/janus@0.13.0

## 0.3.0

### Minor Changes

- [#162](https://github.com/softistx/nxgt-janus/pull/162) [`e4a596b`](https://github.com/softistx/nxgt-janus/commit/e4a596b66408fbcbd41477737824cf0a0a47a9c0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Subscriptions over graphql-ws: `janusConnection({ auth, access?, type?, clock?, upgrade? })` answers `onConnect` for graphql-ws's `useServer()`, which authenticates a WebSocket connection from `connectionParams.authorization` — else from the upgrade request's headers and session cookie — and refuses it `4403`, or rejects on an outage so the socket closes `4500`. In Yoga's recommended setup, `useJanus()` builds each operation's `ctx.janus` from that connection's credential, so `@authenticated`, `@fresh` and `@permission` hold unchanged; `context` builds it for a server without Yoga, and `upgrade` reads the upgrade request on Bun. `graphql-ws` is an optional peer, `^6.0.0`.

## 0.2.0

### Minor Changes

- [#160](https://github.com/softistx/nxgt-janus/pull/160) [`1e84cac`](https://github.com/softistx/nxgt-janus/commit/1e84cacac19f2cfa79bd46429c3ff2538adae4f4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@fresh(maxAge: Int!)`, on a field, a type or an interface: only a session that proved who it is less than `maxAge` seconds ago — signed in, or confirmed since by `auth.stepUp.confirm` — reaches it. An anonymous request is `UNAUTHENTICATED` 401, an older session `STEP_UP_REQUIRED` 403, which tells the client to ask for a step-up, and an outage `SERVICE_UNAVAILABLE` 503. It is checked after `@authenticated` and before any `@permission`, the smallest `maxAge` that applies holds, and a subscription is checked when it subscribes. A `maxAge` not above zero is a `TypeError` naming the field at start-up. `requireFresh(ctx, '10m')` is the same check in a resolver, taking a duration with its unit and never a bare number. `useJanus({ clock })` is the clock both read — the one given to `janus()` — and the system's without it. `janusTypeDefs` and `graphql/janus.graphqls` declare the new directive. Built on `@nxgt/janus` 0.12's `assertFresh`, which the peer range already requires.

## 0.1.1

### Patch Changes

- Updated dependencies [[`87852d5`](https://github.com/softistx/nxgt-janus/commit/87852d5652adcc9a980d9a5f700d27defadffcd7), [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199)]:
  - @nxgt/janus@0.12.0

## 0.1.0

### Minor Changes

- [#155](https://github.com/softistx/nxgt-janus/pull/155) [`7dcfad9`](https://github.com/softistx/nxgt-janus/commit/7dcfad9ea0752ea004fd95aa63ae35469f6faf69) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: `@nxgt/janus` in a GraphQL server, as an envelop plugin for GraphQL Yoga or any server built on envelop. `useJanus({ auth, access?, type?, loaders?, conditions? })` puts a lazy `ctx.janus` on every request — authenticated only when a field asks — and applies the directives once per schema. `@authenticated` guards a field, a type or an interface, optionally for some user types; `@permission(name, type, id, onDeny)` lets a field resolve only for a user who holds the permission on the object it names, answering `NOT_FOUND` (or `FORBIDDEN`, from the `JanusPermissionDenial` enum) on a denial, with one check per question per request. `requireUser()` and `can()` do the same in a resolver, `janusMaskError()` answers every `JanusError` with its status — an outage as 503, never 401, 403 or 404 — and the SDL ships as `janusTypeDefs` and `graphql/janus.graphqls`. What no request could pass is refused at start-up. Tested on graphql 16.9.0 and 17, `@graphql-tools/utils` 10.0.0 and 12 and `@envelop/core` 5.

### Patch Changes

- Updated dependencies [[`9e4bbf5`](https://github.com/softistx/nxgt-janus/commit/9e4bbf53891d98be7291f2e7589a5451903bfa73)]:
  - @nxgt/janus@0.11.0
