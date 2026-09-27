---
"@nxgt/janus-webhooks-redis": minor
---

The first release: `createRedisWebhookQueue(redis, { prefix? })`, a durable `WebhookQueue` for `@nxgt/janus-webhooks` on `@nxgt/redis`. Deliveries wait in Redis, shared by every process of the application, so a retry waiting when one process stops is sent by the next. Every method is one Lua script; a claim is atomic across processes and moves the lease in the same script; an insert is all or none. Only the event and the endpoint id are stored — never a URL or a secret. It passes the `@nxgt/janus-webhooks/conformance` suite against Redis 7.4, outages included. Needs Redis 7 or later (or Valkey), `maxmemory-policy noeviction`, persistence, and no Cluster.
