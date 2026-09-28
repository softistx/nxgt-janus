# @nxgt/janus-graphql

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
