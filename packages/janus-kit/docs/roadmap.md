# Roadmap

Where `@nxgt/janus-kit` is heading. It shows a direction, not a commitment:
there are no dates here, and the only number is the version something shipped
in.

## Now

- **The first release**: PostgreSQL through `@nxgt/janus-drizzle`, sessions and
  one-time tokens in Redis through `@nxgt/janus-redis`, telemetry through
  `@nxgt/janus-telemetry`, a health check and a close. It stays unpublished
  until its adapters are released.

## Next

Nothing yet.

## Later

Nothing yet.

## Shipped

Nothing yet.

## Not planned

- **MongoDB.** With `@nxgt/janus-mongo`, the wiring is already one spread,
  `janus({ …, ...createMongoAdapter(db) })`, and a kit per database would be
  one package more for little. The kit stays PostgreSQL and Redis.
- **Running migrations.** Janus's tables are created by your drizzle-kit
  migrations, as your own are. The kit checks they are there, and creates
  nothing.
- **Building `janus()` or `permissions()` from configuration keys.** You write
  them, in `auth` and `access`, so their types are inferred where you wrote
  them.
- **Node.** The kit opens PostgreSQL over Bun's `SQL` and Redis over Bun's
  `RedisClient`. On Node, wire the adapters yourself.
