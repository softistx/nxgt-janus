# Queues

This page is for deliveries that must outlive the process that failed them:
passing `webhooks()` a `queue`, what the queue promises, and writing and
testing an adapter of the `WebhookQueue` port. The words — queue, claim,
lease, endpoint id, orphan — are defined in [the index](../README.md#words).

```ts
import { webhooks, type WebhookQueue } from '@nxgt/janus-webhooks';

declare const queue: WebhookQueue; // one every process of the application shares

const listener = webhooks({
	endpoints: [{ id: 'crm', url: 'https://crm.example.com/hooks/janus', secrets: [crmSecret] }],
	queue,
});

const auth = janus({ ...options, events: listener });
process.on('SIGTERM', () => listener.close()); // gives nothing up: the next process sends what waits
```

## Why a queue

Every delivery goes through a queue. Without a `queue` option it is one in
the process's memory — `createMemoryWebhookQueue()` — and a crash, or an
exit without `close()`, loses what waits in it: a retry due in five hours
dies with the process. With a `queue` every process shares, a retry failed
by one process is sent by whichever process claims it when it falls due.

| | Without a `queue` | With a `queue` |
| --- | --- | --- |
| Where a retry waits | this process's memory | the queue |
| A crash | loses every retry waiting | loses nothing: a request cut short is sent again once its lease lapses |
| The listener | answers nothing; the insert cannot fail | answers the insert, a `Promise`; `janus` awaits it |
| An insert that fails | — | rejects: `janus` warns `JANUS_EVENT_FAILED`, with the event's id |
| `close()` | gives up what waits, as `closed` | gives nothing up |
| Endpoint id when there is no `id` | the position in `endpoints` | a hash of the URL |

**Delivery is at least once.** A receiver may see a delivery twice: a
process that dies mid-request, a lease that lapses while a request is still
running, a report made just before a crash. Receivers deduplicate on the
`webhook-id` header — the event's id — as they already must for a retry:
see [handling each event once](receiving.md#handling-each-event-once).

## How deliveries move

1. **Insert.** The listener inserts one delivery per endpoint whose `types`
   take the event, due now, and awaits that insert — never the request. Its
   id is `` `${event.id}:${event.type}:${endpoint}` ``, so inserting the
   same event twice keeps one.
2. **Claim.** One pump per process claims what is due, up to the
   `concurrency` requests it may have in flight, walking the endpoints from a
   rotating start so one backlog does not take every slot. A claim counts an
   attempt and hides the delivery until its **lease** ends: `timeout` plus 30
   seconds by default, so no other process claims a request still running.
3. **Send.** The delivery's endpoint id is looked up in the running
   configuration, the body is signed with the secrets configured **now**,
   and posted.
4. **Then**: a `2xx` deletes it; a failure with a retry left schedules it,
   due after the delay, and releases the lease; a failure with none left is
   given up — reported, then deleted.

The pump is woken by an insert, by a timer this process sets for its own
retries, and by a **poll** of the queue — every `poll` (`'1s'`, give or take
a fifth) — which picks up retries other processes scheduled and leases that
lapsed. While `onGivingUp` runs, the lease is extended every third of it.

A delivery that waits for an endpoint id no configuration has — the endpoint
was removed, or its URL changed without an `id` — is an **orphan**. Once it
has been due for `orphanGrace` (`'24h'`), a process gives it up as
`endpointRemoved`, with `delivery.url` `null`: the queue never held the URL.
The grace lets a rolling deploy add or remove an endpoint without one version
giving up the other's deliveries.

When the queue fails, a `JANUS_WEBHOOK_QUEUE_FAILED` warning says so — once
per outage — and the pump backs off, doubling from `poll` up to 30 seconds.
Deliveries wait in the queue meanwhile. A write that fails after a request —
a retry, a delete — leaves the lease to lapse, and the delivery is sent again.

## Choosing the options

```ts
webhooks({
	endpoints,
	queue,
	concurrency: 64, // requests in flight per process, all endpoints together
	timeout: '10s', // per request
	lease: '40s', // > timeout: how long a claimed delivery is hidden
	poll: '1s', // how often the queue is asked for what others left due
	orphanGrace: '24h', // how long a delivery to an unknown endpoint waits
});
```

- **`lease`** must exceed `timeout`, and should leave room for clock skew
  between the processes: the time a lease is compared against is each
  process's own. Keep the processes on NTP.
- **`poll`** is one call to the queue per second per process. Raise it to
  spare the queue; a retry of another process's is then picked up that much
  later.
- **`orphanGrace`** should exceed the longest a deploy takes to roll out.

## The port

```ts
interface QueuedDelivery {
	readonly id: string; // `${event.id}:${event.type}:${endpoint}`
	readonly event: UserEvent;
	readonly endpoint: string; // the endpoint's id — never its URL
	readonly attempts: number; // the claims so far, this one included
	readonly failed: Failure | null; // what the last failed attempt got
	readonly lease: string; // this claim's token
}

interface WebhookQueue {
	insertDeliveries(event: UserEvent, endpoints: readonly string[], dueAt: Date): Promise<number>;
	claimDeliveries(endpoints: readonly string[], now: Date, leaseUntil: Date, limit: number): Promise<readonly QueuedDelivery[]>;
	claimOrphanedDeliveries(known: readonly string[], dueBefore: Date, leaseUntil: Date, limit: number): Promise<readonly QueuedDelivery[]>;
	extendLease(id: string, lease: string, until: Date): Promise<boolean>;
	scheduleRetry(id: string, lease: string, dueAt: Date, failed: Failure): Promise<boolean>;
	deleteDelivery(id: string, lease: string): Promise<boolean>;
}
```

| Method | Answers | Does |
| --- | --- | --- |
| `insertDeliveries` | how many were new | One delivery per endpoint, due at `dueAt`, **all or none**; an id already held is kept as it is |
| `claimDeliveries` | the deliveries, `[]` when none | Up to `limit` due at `now`, the endpoints in the order given and each one's earliest first; each gets `attempts + 1`, a fresh lease, and is hidden until `leaseUntil` |
| `claimOrphanedDeliveries` | the deliveries, `[]` when none | The same claim, for endpoints **not** in `known`, due at `dueBefore` or earlier |
| `extendLease` | `false` when the lease is no longer held | Hides the delivery until `until` |
| `scheduleRetry` | `false` when the lease is no longer held | Due again at `dueAt`, remembering `failed`; releases the lease |
| `deleteDelivery` | `false` when the lease is no longer held, or the delivery is gone | Removes it: delivered, or given up |

The rules an adapter keeps, each checked by the suite:

1. **An absence is `[]` or `false`. A failure throws** — `StoreFailure` from
   `@nxgt/janus`, with `cause`. Never `catch { return [] }`: a claim that
   answers "nothing due" for an outage holds every delivery back without a
   word.
2. **Each method is atomic.** Two claims running at once never answer the
   same delivery — a Lua script, a transaction, a `SELECT … FOR UPDATE SKIP
   LOCKED`.
3. **Bytes round-trip**: the event's five fields exactly as written,
   `occurredAt` to the millisecond, as a `Date`.
4. **Time is passed in.** A queue never reads a clock of its own.
5. **"The lease is no longer held"** means the lease stored differs from the
   one passed: another claim took the delivery over after the lease lapsed,
   or `scheduleRetry` released it. A lease that lapsed and was never taken
   over still matches — harmless.
6. **A claimed delivery stays where it waits**, hidden until `leaseUntil`,
   then due again: a lapsed lease needs no sweep, the next claim takes it.

It holds the event and the endpoint's id — **never the URL** (its query may
hold a receiver's token) **and never a secret**.

## Writing an adapter

The memory reference, `createMemoryWebhookQueue()`, is the shortest correct
adapter: a `Map`, and every method doing all its work before its first
`await`. A database adapter keeps the same shape. What it throws:

```ts
import { StoreFailure } from '@nxgt/janus';
import type { WebhookQueue } from '@nxgt/janus-webhooks';

export function createMyWebhookQueue(db: Db): WebhookQueue {
	return {
		async claimDeliveries(endpoints, now, leaseUntil, limit) {
			try {
				return await db.claim(endpoints, now, leaseUntil, limit); // one atomic statement
			} catch (cause) {
				throw new StoreFailure('webhookQueue.claimDeliveries: the queue could not answer', {
					operation: 'claimDeliveries',
					cause,
				});
			}
		},
		// …the five others, the same way
	};
}
```

`@nxgt/janus` is a **peer** of the adapter, never a dependency: two copies
of it define two `StoreFailure` classes, and the suite's `instanceof` probe
fails the adapter that installs its own.

## Testing an adapter

`@nxgt/janus-webhooks/conformance` runs the port's cases against a harness
that opens a **fresh, empty** queue per case. `faults` makes one method fail
the way the database fails — cut the connection, revoke a permission — and
its absence is reported, never passed over:

```ts
import { describe, it } from 'bun:test';
import { describeWebhookQueues } from '@nxgt/janus-webhooks/conformance';

describeWebhookQueues({
	name: 'my queue',
	runner: { describe, it }, // under bun test, pass them: they are not on globalThis
	harness: {
		async open() {
			const db = await openEmptyDatabase();
			return {
				queue: createMyWebhookQueue(db),
				faults: { fail: async (method) => db.failNext(method) },
				close: () => db.drop(),
			};
		},
	},
});
```

Under vitest with `globals: true`, or jest, `runner` may be left out. The
cases are data too — `allWebhookQueueCases` and `runWebhookQueueCase(case,
harness)` run them with no test framework — and
`referenceWebhookQueueHarness()` is the harness the reference passes with.

| Case | What fails it |
| --- | --- |
| `queue.roundTrip` | an event that comes back altered, a date as a string, `attempts` not `1` after one claim |
| `queue.notBeforeDue` | a claim that answers a delivery a millisecond early, or `null` for none |
| `queue.insertIsIdempotent` | a second insert of the same event making a second delivery |
| `queue.insertIsAllOrNone` | an insert that fails half-way and leaves some endpoints |
| `queue.endpointsFilter` | a claim that answers an endpoint it was not asked for |
| `queue.earliestFirstAndLimit` | a claim that ignores due order, the endpoints' order, or `limit` |
| `lease.hidden`, `lease.expires`, `lease.extend` | a claimed delivery claimable again before its lease ends, or never after |
| `lease.staleLease` | a write with a lease another claim took over that answers `true`, or changes anything |
| `lease.scheduleRetry`, `lease.delete` | a retry due early, a failure forgotten, a delivery that comes back |
| `lease.concurrentClaims` | 20 claims at once answering one delivery twice |
| `orphans.onlyUnknownAndOverdue` | an orphan claim that takes a known endpoint's delivery, or one not overdue |
| `outage.<method>` | a method that answers `[]`, `false` or `0` when the queue cannot answer |

In a test of your own application, share one `createMemoryWebhookQueue()`
between two `webhooks()` to play two processes: close the first after a
failure, and the second sends the retry.

## See also

- [Sending webhooks](sending.md) — every option, giving up, `close()`
- [Troubleshooting](../troubleshooting.md) — `JANUS_WEBHOOK_QUEUE_FAILED`, orphans, a webhook received twice
- [Roadmap](../roadmap.md) — the Redis adapter
