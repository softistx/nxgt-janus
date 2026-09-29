# Roadmap

Where `@nxgt/janus-webhooks-redis` is heading. It shows a direction, not a
commitment: there are no dates here, and the only number is the version
something shipped in.

## Now

Nothing between releases.

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

Newest first; from the first release on, the package's CHANGELOG holds every one.

- **A sign-in from a new device, v0.5.0** — a delivery of
  `user.newDeviceSignedIn`, from `@nxgt/janus` 0.17, is written and read
  back like the other ten. No session id is stored: `@nxgt/janus-webhooks`
  drops the event's `sessionId` before the queue. A 0.4.x process sharing
  the queue cannot read one back: upgrade every process, with each
  endpoint's `types` limited meanwhile.

- **The change events, v0.4.0** — a delivery of `user.passwordChanged` or
  `user.emailChanged`, from `@nxgt/janus` 0.14, is written and read back like
  the other eight. No address is stored: `@nxgt/janus-webhooks` drops an
  e-mail change's `formerEmail` before the queue.

- **The recovery codes' events, v0.3.0** — a delivery of
  `user.recoveryCodesRegenerated` or `user.recoveryCodeUsed`, from
  `@nxgt/janus` 0.10, is written and read back like the other six.
- **The second factor's events, v0.2.0** — a delivery of
  `user.secondFactorEnabled` or `user.secondFactorDisabled`, from
  `@nxgt/janus` 0.9, is written and read back like the other four.
- **The first release, v0.1.0.** The Redis queue for `@nxgt/janus-webhooks`: every
  method one Lua script, claims atomic across processes, an insert all or
  none, and the `@nxgt/janus-webhooks/conformance` suite passed against Redis
  7.4 with the server's own faults.
