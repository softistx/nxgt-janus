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
```

Adapters and integrations still to come, in this order: `@nxgt/janus-hono`,
`@nxgt/janus-drizzle`, `@nxgt/janus-redis`.

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
bun install
bun run check && bun run typecheck && bun run build && bun run test
bun run verify:artifacts
```

Read [AGENTS.md](./AGENTS.md) before changing anything — it carries the
invariants, the declared divergences from `nxgt-data`, and why a published entry
point is a promise.

## Status

v0.1, the first public release. Until 1.0 a minor version may still change
the public surface; the changelog says how.

## Licence

MIT
