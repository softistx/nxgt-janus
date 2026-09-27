# @nxgt/janus-webhooks

## 0.2.1

### Patch Changes

- [#84](https://github.com/softistx/nxgt-janus/pull/84) [`1da1969`](https://github.com/softistx/nxgt-janus/commit/1da196993fa8a7885612726e22b441ceaa75c32f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the README and the roadmap point to `@nxgt/janus-webhooks-redis`, now released, for a queue that survives a restart.

## 0.2.0

### Minor Changes

- [#79](https://github.com/softistx/nxgt-janus/pull/79) [`ba06146`](https://github.com/softistx/nxgt-janus/commit/ba06146f44802cdb8204ac4f88d5ac7c5215f2c9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Deliveries go through a queue, and the queue can outlive the process: a retry waiting when a process crashes or restarts is sent by the next one.
  
  - `webhooks({ queue })` takes a `WebhookQueue`, the new port every process of an application can share. The listener then awaits the insert — one call to the queue, never an endpoint — and a failed insert rejects, so `janus` reports it as `JANUS_EVENT_FAILED` with the event's id. `close()` with a queue gives nothing up: what waits stays for the next process. A request is claimed under a lease, so a process that dies mid-request loses nothing — delivery is at least once, even across restarts; receivers keep deduplicating on `webhook-id`.
  - `createMemoryWebhookQueue()` is the reference queue, and what `webhooks()` uses without one: 0.1.0's behaviour is kept, `close()` giving up every delivery still waiting as `closed`.
  - `@nxgt/janus-webhooks/conformance` is the suite a queue adapter runs — `describeWebhookQueues({ name, harness, runner })` — with an outage case per method: a queue that answers `[]` for a failure fails it.
  - New options: `concurrency` (64 requests at once by default), `lease` (at least `timeout` plus 1s; `timeout` plus 30s by default), and with a queue `poll` and `orphanGrace`. An endpoint takes an optional `id`, what a queue knows it by; without one it is a hash of the URL with a queue. A queue holds that id and the event, never the URL or a secret. Deliveries to an endpoint no process is configured with any more are given up after `orphanGrace` (24 hours).
  - New warning: `JANUS_WEBHOOK_QUEUE_FAILED`, once per outage of the queue, and once per attempt at a delivery the queue answered broken — counted as a failed attempt, so it is given up instead of looping.
  - Without a queue, `close()` first sends every delivery due when it is called, even when every slot was busy.
  - An event no endpoint takes is dropped by the listener before any insert, with or without a queue.
  
  **Breaking, in types** — 0.x, so a minor:
  
  - `GivingUp['why']` gains `'endpointRemoved'`: a `switch` that exhausts `'retriesRanOut' | 'closed'` no longer compiles.
  - `Delivery.url` is `string | null` — `null` for `endpointRemoved`, since a queue never holds the URL — and `Delivery` gains `endpoint`, the endpoint's id. Code that stores `delivery.url` must handle `null`; a test that compares a whole `Delivery` gets the new field.
  - The listener answers `Promise<void> | undefined`: the insert with a queue, and `undefined` without one or for an event no endpoint takes.

## 0.1.0

### Minor Changes

- [#72](https://github.com/softistx/nxgt-janus/pull/72) [`14fd30c`](https://github.com/softistx/nxgt-janus/commit/14fd30cde0a96dd93c1a199418196443ccde24df) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: `@nxgt/janus` user events, delivered as signed Standard Webhooks.
  
  - `webhooks({ endpoints, retries?, timeout?, onGivingUp?, fetch? })` is the listener `janus({ events })` takes. It signs each event with every secret of the endpoint (`whsec_`, HMAC-SHA256; the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers), posts it without holding the flow, and retries a failure on the specification's schedule. Only a `2xx` succeeds; a redirect is not followed.
  - A delivery given up — out of retries, or cut short by `close()` — goes to `onGivingUp`, or is a `JANUS_WEBHOOK_GAVE_UP` warning naming the endpoint's origin only. `close()` waits for the requests in flight. Retries wait in memory; a durable queue is next.
  - `verifyWebhook({ secrets, headers, body })` answers the event a request carries, or `null` for anything the secrets did not sign, outside the tolerance, or not a user event. `mintWebhookSecret()` makes a secret.

### Patch Changes

- Updated dependencies [[`14fd30c`](https://github.com/softistx/nxgt-janus/commit/14fd30cde0a96dd93c1a199418196443ccde24df)]:
  - @nxgt/janus@0.8.2
