# Roadmap

Where `@nxgt/janus-kit` is heading. It shows a direction, not a commitment:
there are no dates here, and the only number is the version something shipped
in.

## Now

- **The first release**: PostgreSQL through `@nxgt/janus-drizzle`, at
  `@nxgt/janus-kit/drizzle`; sessions and
  one-time tokens in Redis through `@nxgt/janus-redis`, telemetry through
  `@nxgt/janus-telemetry`, a health check and a close. It stays unpublished
  until its adapters are released.

## Next

- **MongoDB, at `@nxgt/janus-kit/mongo`.** The same kit over
  `@nxgt/janus-mongo`: it opens the client or takes your `Db`, checks at
  startup that the four collections are synced, and answers the same `auth`,
  `access`, `ping` and `close`. A subpath of this package, not a package of
  its own: Redis, telemetry and the lifecycle are shared, and one version
  covers both.

## Later

Nothing yet.

## Shipped

Nothing yet.

## Not planned

- **Running migrations.** Janus's tables are created by your drizzle-kit
  migrations, as your own are. The kit checks they are there, and creates
  nothing.
- **Building `janus()` or `permissions()` from configuration keys.** You write
  them, in `auth` and `access`, so their types are inferred where you wrote
  them.
- **Node.** The kit opens PostgreSQL over Bun's `SQL` and Redis over Bun's
  `RedisClient`. On Node, wire the adapters yourself.
