---
'@nxgt/janus-webhooks': minor
---

Deliveries go through a queue, and the queue can outlive the process: a retry waiting when a process crashes or restarts is sent by the next one.

- `webhooks({ queue })` takes a `WebhookQueue`, the new port every process of an application can share. The listener then awaits the insert — one call to the queue, never an endpoint — and a failed insert rejects, so `janus` reports it as `JANUS_EVENT_FAILED` with the event's id. `close()` with a queue gives nothing up: what waits stays for the next process. A request is claimed under a lease, so a process that dies mid-request loses nothing — delivery is at least once, even across restarts; receivers keep deduplicating on `webhook-id`.
- `createMemoryWebhookQueue()` is the reference queue, and what `webhooks()` uses without one: 0.1.0's behaviour is kept, `close()` giving up every delivery still waiting as `closed`.
- `@nxgt/janus-webhooks/conformance` is the suite a queue adapter runs — `describeWebhookQueues({ name, harness, runner })` — with an outage case per method: a queue that answers `[]` for a failure fails it.
- New options: `concurrency` (64 requests at once by default), `lease` (at least `timeout` plus 1s; `timeout` plus 30s by default), and with a queue `poll` and `orphanGrace`. An endpoint takes an optional `id`, what a queue knows it by; without one it is a hash of the URL with a queue. A queue holds that id and the event, never the URL or a secret. Deliveries to an endpoint no process is configured with any more are given up after `orphanGrace` (24 hours).
- New warning: `JANUS_WEBHOOK_QUEUE_FAILED`, once per outage of the queue, and once per attempt at a delivery the queue answered broken — counted as a failed attempt, so it is given up instead of looping.
- Without a queue, `close()` first sends every delivery due when it is called, even when every slot was busy; and an event no endpoint takes is dropped by the listener before any insert.

**Breaking, in types** — 0.x, so a minor:

- `GivingUp['why']` gains `'endpointRemoved'`: a `switch` that exhausts `'retriesRanOut' | 'closed'` no longer compiles.
- `Delivery.url` is `string | null` — `null` for `endpointRemoved`, since a queue never holds the URL — and `Delivery` gains `endpoint`, the endpoint's id. Code that stores `delivery.url` must handle `null`; a test that compares a whole `Delivery` gets the new field.
- The listener answers `Promise<void> | undefined`: the insert with a queue, nothing without one.
