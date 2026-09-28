# nxgt-janus

An **embeddable alternative to the Ory suite**: identities and permissions as a
TypeScript library your application runs in its own process, with the database
behind a port you may implement yourself.

Not a service. No container, no migration runner, no second Postgres, no port to
expose. You wire a store, you get a typed API.

Two **sides**, each usable alone: **identities** — users, logins, passwords,
sessions, one-time tokens — and **permissions** — a model, the tuples stored
against it, and `can`. Use one, the
other, or both.

```
packages/janus         @nxgt/janus — both sides, and the vocabulary they share
packages/janus-mongo   @nxgt/janus-mongo — the MongoDB adapter, for either side
packages/janus-hono    @nxgt/janus-hono — the Hono integration
packages/janus-graphql @nxgt/janus-graphql — the GraphQL integration: an envelop plugin, @authenticated and @permission, errors as statuses
packages/janus-telemetry @nxgt/janus-telemetry — spans and security events on @nxgt/telemetry
packages/janus-webhooks @nxgt/janus-webhooks — user events as signed Standard Webhooks: retries through a pluggable durable queue, rotating secrets, verifyWebhook for receivers
packages/janus-drizzle @nxgt/janus-drizzle — the PostgreSQL adapter on Drizzle and @nxgt/drizzle, for either side
packages/janus-redis   @nxgt/janus-redis — sessions and one-time tokens in Redis, on @nxgt/redis
packages/janus-webhooks-redis @nxgt/janus-webhooks-redis — the durable webhook queue in Redis, on @nxgt/redis
packages/janus-kit     @nxgt/janus-kit — Janus wired in one call, one subpath per database (/drizzle, /mongo), with Redis, telemetry, health and close
packages/janus-mail    @nxgt/janus-mail — the flows' e-mails, prebuilt in en and fr, sent through any @nxgt/mail transport
```

## Two things it is trying to be

**Typed, measurably.** Type safety is the selling point, so it is counted rather
than claimed: every public refusal has a `@ts-expect-error` case in
`test/types/`, and each package's README carries the number of plausible
mistakes the compiler rejects. A count that goes down is a visible regression.

**Honest about outages.** An absence is `null`; a failure throws. A store that
turns a refused connection into "no such user" locks out every user, and that has been measured twice in this organisation. Here it is a term of
the port, checked by a published conformance suite rather than documented and
hoped for.

## Working in this repository

```sh
REDISMS_DISABLE_POSTINSTALL=1 bun install
bun run check && bun run build && bun run typecheck && bun run test
bun run verify:artifacts
bun run changeset:private
```

Read [AGENTS.md](./AGENTS.md) before changing anything — it carries the
invariants, the declared divergences from `nxgt-data`, and why a published entry
point is a promise.

## Status

v0.1, the first public release. Until 1.0 a minor version may still change
the public surface; the changelog says how.

## Licence

MIT
