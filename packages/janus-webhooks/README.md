# @nxgt/janus-webhooks

[`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) user events,
delivered as signed webhooks by the
[Standard Webhooks](https://www.standardwebhooks.com) specification: each
user event is posted to your endpoints, signed with HMAC-SHA256, retried on
failure — through a queue that can outlive the process — and every delivery
given up is reported, never dropped without a word. The receiving side checks
the signature with `verifyWebhook`, or with any Standard Webhooks library.

```ts
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { webhooks } from '@nxgt/janus-webhooks';
import { z } from 'zod';

const secret = process.env.WEBHOOK_SECRET; // whsec_…, from mintWebhookSecret()
if (!secret) throw new Error('WEBHOOK_SECRET is not set');

const listener = webhooks({
	endpoints: [{ url: 'https://crm.example.com/hooks/janus', secrets: [secret] }],
});

export const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	events: listener, // every user.created, user.emailVerified, user.passwordReset, user.passwordChanged, user.emailChanged, user.secondFactorEnabled, user.secondFactorDisabled, user.recoveryCodesRegenerated, user.recoveryCodeUsed, user.deleted
});

process.on('SIGTERM', async () => {
	await listener.close(); // waits for requests in flight, gives up the deliveries waiting for a retry
	process.exit(0);
});
```

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-webhooks @nxgt/janus
bun add zod # the schema of the examples; any Standard Schema library will do
bun add -d typescript
```

Both peers are required: `@nxgt/janus` 0.14 — the exact range is in
`peerDependencies` — and `typescript` (6). `@nxgt/janus` is a **peer**, so one copy of it defines
`UserEvent`. Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`.
It uses `node:crypto`, the global `fetch` and `process.emitWarning`: Bun or
Node.

## Subpaths

| Import | What it holds |
| --- | --- |
| `@nxgt/janus-webhooks` | **Sending and receiving**: `webhooks()`, `verifyWebhook()`, `mintWebhookSecret()`, and the `WebhookQueue` port with its in-memory reference, `createMemoryWebhookQueue()` |
| `@nxgt/janus-webhooks/conformance` | **For queue adapters**: the suite a `WebhookQueue` runs — see [API](#api) |

An adapter's spec runs the suite against a fresh, empty queue per case:

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
				faults: { fail: async (method) => db.failEvery(method) }, // leave out, and the outage cases pass with a JANUS_CONFORMANCE_SKIPPED warning
				close: () => db.drop(),
			};
		},
	},
});
```

The [queues guide](docs/guide/queues.md#testing-an-adapter) has every case
and what fails it.

## Usage

### Sending — `webhooks()`

`webhooks({ endpoints })` answers the listener `janus({ events })` takes,
with a `close()` for shutdown. It posts each user event to every endpoint
whose `types` include it — all ten types when `types` is absent:

```ts
import { webhooks } from '@nxgt/janus-webhooks';

const listener = webhooks({
	endpoints: [
		{ url: 'https://crm.example.com/hooks/janus', secrets: [crmSecret] },
		{ url: 'https://search.example.com/hooks', secrets: [searchSecret], types: ['user.deleted'] },
	],
	retries: ['5s', '5m', '30m', '2h', '5h', '10h', '10h'], // the default: at once, then these
	timeout: '10s', // the default, per request
	onGivingUp: async (delivery, reason) => {
		// reason.why: 'retriesRanOut' | 'closed' | 'endpointRemoved'; delivery.attempts: how many requests were sent
		await deadLetters.insert({ eventId: delivery.event.id, endpoint: delivery.endpoint, ...reason });
	},
});
```

The [sending guide](docs/guide/sending.md) has every option, the retry
schedule, when a delivery is given up and why, the wire format, and a test.

### Surviving a restart — `queue`

Without a `queue`, deliveries wait in the process's memory: a crash loses the
retries still waiting. Pass a `WebhookQueue` that every process shares, and a
retry failed by one process is sent by the next:

```ts
import { createMemoryWebhookQueue, webhooks } from '@nxgt/janus-webhooks';

const secret = process.env.WEBHOOK_SECRET; // whsec_…, from mintWebhookSecret()
if (!secret) throw new Error('WEBHOOK_SECRET is not set');

// The reference, in memory: swap in a durable adapter of the port — such as
// createRedisWebhookQueue(redis) from @nxgt/janus-webhooks-redis — for a
// queue that survives a restart.
const queue = createMemoryWebhookQueue();

const listener = webhooks({
	endpoints: [{ id: 'crm', url: 'https://crm.example.com/hooks/janus', secrets: [secret] }],
	queue, // the listener now awaits the insert — one call to the queue, never an endpoint
});

process.on('SIGTERM', async () => {
	await listener.close(); // gives nothing up: what waits is sent by the next process
	process.exit(0);
});
```

`createMemoryWebhookQueue()` is the port's reference, and
`@nxgt/janus-webhooks/conformance` the suite an adapter runs. The
[queues guide](docs/guide/queues.md) has the contract, leases, endpoint ids,
and how to write and test an adapter.

### Receiving — `verifyWebhook()`

`verifyWebhook` answers the `UserEvent` a request carries, or `null` when it
is not one the endpoint's secrets signed. In a fetch-style handler:

```ts
import { verifyWebhook } from '@nxgt/janus-webhooks';

export async function receive(request: Request): Promise<Response> {
	const event = verifyWebhook({
		secrets: [secret],
		headers: request.headers,
		body: await request.text(), // the raw body: never request.json()
	});
	if (event === null) return new Response(null, { status: 401 }); // forged, altered, replayed late, or not a user event
	if (await handled.has(event.id)) return new Response(null, { status: 204 }); // a retry of one already handled

	await onUserEvent(event); // { id, type, occurredAt, userId, userType }
	await handled.add(event.id);
	return new Response(null, { status: 204 });
}
```

The [receiving guide](docs/guide/receiving.md) has the options, every reason
for `null`, Hono and Node handlers, handling an event once, and a test.

### Secrets — `mintWebhookSecret()`

```ts
import { mintWebhookSecret } from '@nxgt/janus-webhooks';

mintWebhookSecret(); // 'whsec_…': 32 random bytes, base64 — give the same one to the sender and the receiver
```

A secret from another Standard Webhooks library is accepted as it stands if
it holds 24 to 64 bytes after `whsec_`, the range the specification sets.

## API

| Export | What it is |
| --- | --- |
| `webhooks(options)` | The listener for `janus({ events })`, and `close()`. Options: `endpoints` (each `{ url, secrets, types?, id? }`), `retries`, `timeout`, `onGivingUp`, `fetch`, `queue`, `concurrency`, `lease`, `poll`, `orphanGrace`. With a `queue` the listener answers the insert, a `Promise`; without one, or for an event no endpoint takes, `undefined`. Wiring mistakes are a `TypeError` when it is called, and so is an event rebuilt by hand that is not one, when the listener is |
| `verifyWebhook(options)` | `{ secrets, headers, body, toleranceSeconds?, now? }` → `UserEvent \| null`. Headers as a fetch `Headers` or a Node header record. No secret, a malformed one, a `toleranceSeconds` that is not a finite number of seconds, or a `now` that is not a valid `Date` is a `TypeError` |
| `mintWebhookSecret()` | A new `whsec_` secret for an endpoint |
| `createMemoryWebhookQueue()` | The reference `WebhookQueue`, in memory: what `webhooks()` uses without a `queue`, and one to share between two `webhooks()` in a test |
| `WebhookQueue`, `QueuedDelivery` | The port a durable queue implements, and one delivery as it holds it: the event and the endpoint's id, never the URL or a secret |
| `WebhooksOptions`, `WebhookEndpoint`, `Webhooks` | What `webhooks()` takes and answers |
| `Delivery`, `GivingUp`, `Failure` | What `onGivingUp` receives: `{ event, url, endpoint, attempts }` — `url` is `null` for `endpointRemoved` — and `{ why, status, error }`: a `GivingUp` is a `Failure`, what the last attempt got, with the reason |
| `VerifyOptions`, `HeadersLike`, `WebhookBody` | What `verifyWebhook` takes, and the JSON body on the wire |
| `@nxgt/janus-webhooks/conformance` | The suite a queue adapter runs: `describeWebhookQueues({ name, harness, runner })`, `runWebhookQueueCase`, the cases as data (`webhookQueueCases`, `webhookQueueOutageCases`, `allWebhookQueueCases`), `referenceWebhookQueueHarness()`, `SKIP_REASONS`, and their types. It imports no test framework |

## Traps

**Retries wait in memory, unless you pass a `queue`.** Without one, a crash,
or an exit without `close()`, loses every retry still waiting, and nothing
sends it later. With a `queue` every process shares, what one process leaves
waiting — a retry, a request cut short by a crash — the next one sends.

**At least once, even across restarts.** A delivery is claimed under a
lease, and a process that dies mid-request loses nothing: once the lease
lapses, another process sends it again — so a receiver may see one twice,
and a crash costs one attempt of the schedule. Receivers deduplicate on
`webhook-id`, as they already must for a retry. A `lease` is at least
`timeout` plus one second: the worker extends it before reporting a failure,
so a slow `onGivingUp` does not hand the delivery to another process.

**Call `close()` on shutdown.** Without a `queue`, it first sends every
delivery due at `close()` — `concurrency` at a time, so an event taken while
every slot was busy still gets its attempt — waits for the requests in
flight, and gives up the deliveries waiting for a retry, each reported as
`closed` — without it they vanish without a word. With one, it waits for the
requests in flight and gives nothing up. `process.on('SIGTERM', () =>
listener.close())`.

**The listener waits for the insert only.** Every delivery goes through a
queue; the listener awaits the insert — a `Map` in memory, one call with a
`queue` — then returns, and the first request starts at once, so `signUp`
never waits for an endpoint. With a `queue`, an insert that fails rejects,
and `janus` reports it as `JANUS_EVENT_FAILED` with the event's id. A retry's
timer does not hold the process open — end a script with `await
listener.close()`.

**An endpoint's id is what a queue knows it by.** Without an `id`, it is a
hash of the URL: changing the URL of an endpoint with deliveries waiting
leaves them to no endpoint, and after `orphanGrace` (24 hours) they are given
up as `endpointRemoved`, with `delivery.url` `null`. Give each endpoint an
`id` when you first pass a `queue`: adding one later changes the id too.

**A redirect is a failure, and only a `2xx` is a success.** Redirects are not
followed: point `url` at the final address, `https://` — `http://` only to
`localhost`.

**Verify the raw body, before any parsing.** The signature covers the bytes
as sent: `await request.text()`, never `request.json()` nor a body parser
that re-serialises it.

**A replay inside the tolerance verifies.** A request copied and sent again
within `toleranceSeconds` (300) passes, and so does a retry of one you already
handled: keep the ids handled — `event.id`, the `webhook-id` header — and
answer a second with a `2xx`, doing nothing.

**Rotate a secret in four steps.** Sign with both
(`secrets: [old, next]`), let the receiver accept both, then drop the old one
from the sender, and last from the receiver.

**A secret holds 24 to 64 bytes.** Past 64, `webhooks()` and `verifyWebhook()`
throw a `TypeError` — since 0.4.0; earlier versions took any length from 24.
A longer secret from before is refused on upgrade, so rotate away from it
first, on the version you run: mint one with `mintWebhookSecret()`, rotate to
it in the four steps above, then upgrade.

**Upgrade the receiver before the sender.** A receiver's `verifyWebhook`
answers `null` for a type it does not know, so the delivery fails until it is
given up — `@nxgt/janus-webhooks` before 0.3.0 knows neither
`user.secondFactorEnabled` nor `user.secondFactorDisabled`, and before 0.4.0
neither `user.recoveryCodesRegenerated` nor `user.recoveryCodeUsed`, and
before 0.6.0 neither `user.passwordChanged` nor `user.emailChanged`. Until
every receiver is upgraded, give its endpoint the `types` it knows:

```ts
webhooks({
	endpoints: [{ url, secrets: [secret], types: ['user.created', 'user.emailVerified', 'user.passwordReset', 'user.deleted'] }],
});
```

That list is for a receiver before 0.3.0. For one on 0.3.x, which knows the
second factor's events but not the recovery codes', add those two:

```ts
types: ['user.created', 'user.emailVerified', 'user.passwordReset', 'user.secondFactorEnabled', 'user.secondFactorDisabled', 'user.deleted'],
```

For one on 0.4.x or 0.5.x, which knows the recovery codes' events but not
the change events', add those two:

```ts
types: ['user.created', 'user.emailVerified', 'user.passwordReset', 'user.secondFactorEnabled', 'user.secondFactorDisabled', 'user.recoveryCodesRegenerated', 'user.recoveryCodeUsed', 'user.deleted'],
```

**`user.emailChanged` is posted without its `formerEmail`.** `@nxgt/janus`
hands the listener the address the user had before, so a notice can reach
that inbox; `webhooks()` drops it before the queue, so no endpoint, queue or
`onGivingUp` report ever holds an address. A receiver reads the user by
`userId` as for any type; send the notice to the former address from the
`janus({ events })` listener instead, beside `webhooks()`:

```ts
const auth = janus({
	...config,
	async events(event) {
		await listener(event); // webhooks(): every type, formerEmail dropped
		if (event.type === 'user.emailChanged' && event.formerEmail != null) {
			const user = await auth.get(event.userId);
			await mail.emailChanged({ name: user.name, formerEmail: event.formerEmail, newEmail: user.email });
		}
	},
});
```

**The warnings name the URL's origin, never the URL.** `JANUS_WEBHOOK_GAVE_UP`
writes `https://crm.example.com` because a path or query may hold a token of
the receiver's; `onGivingUp` receives the full `delivery.url`, so do not log
it as it stands. A queue never holds the URL at all — only the endpoint's
id.

The symptoms and fixes are in [troubleshooting](docs/troubleshooting.md).

## Type safety, counted

**Eleven plausible mistakes, eleven refused at compile time.**
`test/types/webhooks.ts` holds one `@ts-expect-error` per mistake, beside the
wiring that must keep compiling (`janus({ events: webhooks(…) })`, with and
without a `queue`): an endpoint with no secret, a secret read from the
environment and not checked (`string | undefined`), a type `janus` never
sends, a retry that is not a `Duration`, a receiver with no secret, reading a
verified event before checking it for `null`, a queue missing a method, a
`concurrency` written as a string, an endpoint `id` written as a number, a
`switch` over `reason.why` that forgets `endpointRemoved`, and an
`onGivingUp` that reads `delivery.url` without checking it for `null` — the
URL of an endpoint no longer configured.

## Documentation

- [Guides](docs/README.md) — sending, receiving and queues, every option with an example
- [Troubleshooting](docs/troubleshooting.md) — by the warning or error you see
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned

## Licence

MIT
