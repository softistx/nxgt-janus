# Roadmap

Where `@nxgt/janus-redis` is heading. It shows a direction, not a commitment:
there are no dates here, and the only number is the version something shipped
in.

## Now

Nothing yet.

## Next

Nothing yet.

## Later

Nothing yet.

## Not planned

- **Users in Redis.** A user is written once and kept. Keep users in
  `@nxgt/janus-mongo`, `@nxgt/janus-drizzle` or a store of your own.
- **The relation store in Redis.** `list()` pages objects in id order through
  a reverse index, which a database does better.
- **Redis Cluster.** A script reads keys it finds on the way, which may live
  in different slots.
- **`collectExpired()`.** Redis expires sessions itself; the method answers
  `UNSUPPORTED` on purpose.
- **Clients other than Bun's.** `@nxgt/redis`'s connection is Bun's
  `RedisClient`, so this runs on Bun.
- **Error classes of its own.** The adapter throws `@nxgt/janus`'s classes,
  which is why `@nxgt/janus` is a required peer and never a dependency.

## Shipped

- **A user's tokens spent in one script, v0.3.0** — for `@nxgt/janus` 0.7:
  `spendUserTokens(userId, kind, at)` walks the user's set of tokens in one
  Lua script, with the commands the ACL already allows, and passes the three
  new conformance cases.
- **Attempts counted on a one-time token, v0.2.0** — for `@nxgt/janus` 0.4:
  a token keeps its `codeHash` and `attempts`, and `countAttempt` counts an
  attempt at a code in one Lua script. No migration: a token written before
  reads as no code and no attempt.
- **The first release, v0.1.0.** Sessions and one-time tokens in Redis,
  expired by Redis itself; the adapter passes the conformance suite for both
  stores on Redis 7.4.
