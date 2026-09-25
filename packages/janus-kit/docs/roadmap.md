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

- **MongoDB in place of PostgreSQL**, through `@nxgt/janus-mongo`: `mongo`
  beside `postgres`, one of the two.

## Later

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
