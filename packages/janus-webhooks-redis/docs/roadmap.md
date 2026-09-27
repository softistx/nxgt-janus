# Roadmap

Where `@nxgt/janus-webhooks-redis` is heading. It shows a direction, not a
commitment: there are no dates here, and the only number is the version
something shipped in.

## Now

- **The first release.** The Redis queue for `@nxgt/janus-webhooks`: every
  method one Lua script, claims atomic across processes, an insert all or
  none, and the `@nxgt/janus-webhooks/conformance` suite passed against Redis
  7.4 with the server's own faults. Private until it is reviewed and
  published with a changeset of its own.

## Next

Nothing yet.

## Later

Nothing yet.

## Not planned

- **Redis Cluster.** A script touches a delivery's key and its endpoint's,
  which may live in different slots.
- **Expiring deliveries in Redis.** A delivery stays until it is delivered or
  given up: an expiry would drop it without a report, which is what the
  queue exists to prevent.
- **Clients other than Bun's.** `@nxgt/redis`'s connection is Bun's
  `RedisClient`, so this runs on Bun.
- **Error classes of its own.** The adapter throws `@nxgt/janus`'s
  `StoreFailure`, which is why `@nxgt/janus` is a required peer and never a
  dependency.

## Shipped

Nothing yet.
