# Sending webhooks

This page is for delivering `@nxgt/janus` user events to your endpoints as
signed webhooks: wiring `webhooks()` into `janus({ events })`, choosing what
each endpoint receives, retrying, giving up, and shutting down.

```ts
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { webhooks } from '@nxgt/janus-webhooks';
import { z } from 'zod';

const secret = process.env.WEBHOOK_SECRET;
if (!secret) throw new Error('WEBHOOK_SECRET is not set');

const hooks = webhooks({
	endpoints: [{ url: 'https://crm.example.com/hooks/janus', secrets: [secret] }],
});

const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	events: hooks,
});

await auth.signUp({ email: 'ada@example.com', password: 'correct horse' });
// POST https://crm.example.com/hooks/janus, signed, with
// {"type":"user.created","timestamp":"2026-09-26T11:59:00.000Z","data":{"userId":"0199…","userType":"user"}}

process.on('SIGTERM', () => hooks.close());
```

`hooks` is a function — the listener — with a `close()` method. The words
used here — endpoint, delivery, attempt, retry, give up — are defined in
[the index](../README.md#words).

## Options

```ts
webhooks({ endpoints, retries?, timeout?, onGivingUp?, fetch? });
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `endpoints` | `readonly WebhookEndpoint[]` | required, at least one | Where each user event is posted |
| `retries` | `readonly Duration[]` | `['5s', '5m', '30m', '2h', '5h', '10h', '10h']` | How long to wait before each retry. `[]` sends once |
| `timeout` | `Duration` | `'10s'` | How long one request may take before it counts as failed, a `TimeoutError` |
| `onGivingUp` | `(delivery: Delivery, reason: GivingUp) => void \| Promise<void>` | a `JANUS_WEBHOOK_GAVE_UP` warning | Called once for each delivery given up |
| `fetch` | `typeof fetch` | the global `fetch` | What the requests go through: a proxy, an instrumented `fetch`, a fake in a test |

A `Duration` is `@nxgt/janus`'s: milliseconds as a number, or `'500ms'`,
`'5s'`, `'5m'`, `'2h'`, `'1d'`.

### An endpoint

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `url` | `string` | required | `https://`, or `http://` to `localhost`, `127.0.0.1` or `[::1]` for development |
| `secrets` | `readonly [string, ...string[]]` | required, at least one | Each request is signed with every one: two while a secret is [rotated](#secrets-and-rotation) |
| `types` | `readonly UserEventType[]` | every type | The user event types this endpoint receives |

```ts
const hooks = webhooks({
	endpoints: [
		// Every user event.
		{ url: 'https://crm.example.com/hooks/janus', secrets: [crmSecret] },
		// Only deletions: a search index that must forget a user.
		{ url: 'https://search.example.com/hooks', secrets: [searchSecret], types: ['user.deleted'] },
		// A local receiver while developing.
		{ url: 'http://localhost:3000/hooks', secrets: [devSecret] },
	],
});
```

Each endpoint gets its own delivery of an event, retried and given up on its
own: one endpoint down never delays another.

`secrets` is a non-empty tuple, so `secrets: []` does not compile, nor does
`secrets: [process.env.WEBHOOK_SECRET]` — a `string | undefined`. Check the
variable first, as the first example does. `types` takes the four
`UserEventType`s — `'user.created'`, `'user.emailVerified'`,
`'user.passwordReset'`, `'user.deleted'` — and nothing else.

### Wiring refusals

`webhooks()` checks its options when it is called, and throws a bare
`TypeError` for a mistake — they are configuration, never a request:

| Message | Cause |
| --- | --- |
| `webhooks: pass at least one endpoint` | `endpoints` absent or `[]` |
| `webhooks: an endpoint's url is not a URL` | `new URL(url)` threw: a relative path, a typo |
| `webhooks: an endpoint's url must be https:// — http:// only to localhost` | `http://` to any other host, or another scheme |
| `webhooks: an endpoint needs at least one secret` | `secrets` absent or `[]` |
| `webhooks: a secret is written whsec_<base64> — make one with mintWebhookSecret()` | a secret without the `whsec_` prefix, or not a string |
| `webhooks: a secret holds at least 24 bytes of base64 after whsec_ — make one with mintWebhookSecret()` | a secret too short, or not base64 |
| `webhooks: an endpoint's types are user event types — user.created, user.emailVerified, user.passwordReset, user.deleted` | a type `janus` never sends |
| `webhooks: retries: …`, `webhooks: timeout: …` | a duration `parseDuration` refuses: `'soon'`, `-1` |

[Troubleshooting](../troubleshooting.md) has each with its fix.

## What counts as a success

**A `2xx`, and nothing else.** Each attempt is one `POST`:

- a `2xx` ends the delivery: delivered;
- any other status fails the attempt — `4xx` and `5xx` alike, and a **redirect,
  which is not followed** (`redirect: 'manual'`);
- a network error fails it, named by its error — a `TypeError` from `fetch`;
- a request still unanswered after `timeout` is aborted and fails it, as a
  `TimeoutError`.

The response body is never read. Point `url` at the final address: an
endpoint that moved and answers `301` fails every attempt.

## Retries

A failed attempt waits for the next delay of `retries`, then sends again. The
default is the schedule the Standard Webhooks specification recommends —
eight attempts over a day and more:

| Attempt | After the one before | Since the event |
| --- | --- | --- |
| 1 | at once | 0 |
| 2 | 5 s | 5 s |
| 3 | 5 min | 5 min 5 s |
| 4 | 30 min | 35 min 5 s |
| 5 | 2 h | 2 h 35 min 5 s |
| 6 | 5 h | 7 h 35 min 5 s |
| 7 | 10 h | 17 h 35 min 5 s |
| 8 | 10 h | 27 h 35 min 5 s |

"After the one before" counts from the end of the failed attempt, so a
timeout adds up to `timeout` to each line. When the eighth fails, the
delivery is given up as `retriesRanOut`.

```ts
// Three retries, over an hour: for a receiver you run yourself.
webhooks({ endpoints, retries: ['10s', '1m', '1h'] });

// Once, and no retry: reported at the first failure.
webhooks({ endpoints, retries: [] });
```

Every attempt of a delivery carries **the same `webhook-id`** — the event's
`id` — and a **fresh `webhook-timestamp`** and signature, so a retry sent ten
hours later still falls inside the receiver's tolerance. The receiver tells a
retry of one it already handled by that id: see
[handling an event once](receiving.md#handling-each-event-once).

The first attempt is sent at once, not on a timer: the listener starts the
request and returns, so `signUp` answers without waiting for any endpoint,
and the request under way keeps the process alive until it ends. Retries
wait on timers that **do not** keep the process alive, and **in memory**: a
crash or an exit loses them. That is what [`close()`](#shutdown--close) is
for.

## Giving up

A delivery is given up when it ends without a `2xx`. `onGivingUp` is called
once for it, with the delivery and the reason:

```ts
interface Delivery {
	readonly event: UserEvent;
	readonly url: string; // the endpoint's url, as new URL(url).href writes it
	readonly attempts: number; // requests sent: 0 for one closed before its first
}

interface GivingUp {
	readonly why: 'retriesRanOut' | 'closed';
	readonly status: number | null; // the last response's status, or null when there was none
	readonly error: string | null; // the last failure's name — 'TimeoutError', 'TypeError' — or null
}
```

Exactly when each reason is given:

| What happened | `why` | `attempts` | `status`, `error` |
| --- | --- | --- | --- |
| Every attempt failed, the last one included | `retriesRanOut` | `retries.length + 1` | the last attempt's — even when `close()` was called while it was in flight |
| `close()` found the delivery waiting for a retry | `closed` | the attempts already sent | the last attempt's |
| An attempt in flight when `close()` was called failed, with a retry still left | `closed` | the attempts sent, that one included | that attempt's |
| The event reached the listener after `close()` | `closed` | `0`: nothing was sent | `null`, `null` |

An attempt in flight when `close()` was called that answers a `2xx` is
delivered, and not given up. `retries: []` makes every failure a
`retriesRanOut`, with `attempts: 1`.

### `onGivingUp`

Keep what it receives where you can act on it — a dead-letter table, an
alert:

```ts
import { type Delivery, type GivingUp, webhooks } from '@nxgt/janus-webhooks';

const hooks = webhooks({
	endpoints,
	async onGivingUp(delivery: Delivery, reason: GivingUp) {
		await deadLetters.insertOne({
			eventId: delivery.event.id,
			event: delivery.event,
			endpoint: new URL(delivery.url).origin, // the path or query may hold a token
			attempts: delivery.attempts,
			...reason,
		});
	},
});
```

It is called once per delivery given up, and awaited by `close()` for every
delivery `close()` gives up or waits for. A delivery given up because its
event arrived after `close()` is reported, but nothing awaits that report.

`delivery.url` is the whole URL the requests went to. A path or a query can
hold a token of the receiver's: log its origin, as above, not the URL.

An `onGivingUp` that throws, or rejects, is caught and becomes a warning,
naming the event and the failure's name — never its message:

```
(node:4242) [JANUS_WEBHOOK_REPORT_FAILED] Warning: webhooks: onGivingUp failed on user.created 0199…: Error
```

### Without `onGivingUp`

Each delivery given up is a `JANUS_WEBHOOK_GAVE_UP` warning instead, so
nothing is given up without a word:

```
(node:4242) [JANUS_WEBHOOK_GAVE_UP] Warning: webhooks: gave up user.created 0199… to https://crm.example.com after 8 attempts (retriesRanOut, 503)
```

It names the event's type and id, the endpoint's **origin only**, the
attempts, the reason, and the last status — or the error's name, or
`no answer` when there was neither. Listen for it where you watch your
process's health:

```ts
process.on('warning', (warning) => {
	const code = (warning as { code?: string }).code;
	if (code === 'JANUS_WEBHOOK_GAVE_UP' || code === 'JANUS_WEBHOOK_REPORT_FAILED') {
		logger.error(warning.message);
	}
});
```

### Sending a given-up event again

The event is all it takes. A listener built for that one endpoint sends it
with the same `id`, so a receiver that already handled it ignores it:

```ts
import type { UserEvent } from '@nxgt/janus';
import { webhooks } from '@nxgt/janus-webhooks';

async function resend(event: UserEvent): Promise<void> {
	const once = webhooks({ endpoints: [crmEndpoint], retries: [] });
	once(event);
	await once.close();
}
```

## Shutdown — `close()`

```ts
close(): Promise<void>;
```

`close()` cancels the retries still waiting and gives each up as `closed`,
waits for the requests in flight — and for the reports of those that fail —
then resolves. After it, the listener sends nothing: an event it receives is
given up as `closed`, with `attempts: 0`.

Call it on `SIGTERM`, after the server has stopped taking requests, so no
flow sends an event to a closed listener:

```ts
process.on('SIGTERM', async () => {
	await server.stop(); // no more sign-ups
	await hooks.close(); // then the deliveries
	process.exit(0);
});
```

A script — an import, a migration — that sends user events ends with it too:
a retry's timer does not keep the process alive, so a script that returns
without `close()` exits past it, and the delivery is lost without a report.

```ts
for (const row of rows) await auth.create(row);
await hooks.close();
```

A request in flight is aborted after `timeout`, so `close()` waits for it
no longer than that — plus the time `onGivingUp` takes.

## The wire format

Each attempt is a `POST` to the endpoint's `url`:

| Header | Value |
| --- | --- |
| `content-type` | `application/json` |
| `webhook-id` | the event's `id`, a UUIDv7 — the same on every attempt |
| `webhook-timestamp` | the attempt's time, in whole seconds since the epoch |
| `webhook-signature` | `v1,<base64>`, one per secret, separated by a space |

The body is the Standard Webhooks envelope around the event, a
`WebhookBody`:

```json
{
	"type": "user.created",
	"timestamp": "2026-09-26T11:59:00.000Z",
	"data": { "userId": "0199a0db-f800-7000-8000-000000000002", "userType": "user" }
}
```

```ts
interface WebhookBody {
	readonly type: UserEventType;
	readonly timestamp: string; // the event's occurredAt, ISO 8601: when the write landed
	readonly data: { readonly userId: string; readonly userType: string };
}
```

It carries what the user event carries — **the user by id, and nothing
else**: no login, no e-mail, no field. The event's `id` travels as the
`webhook-id` header, not in the body.

The signature is the specification's: HMAC-SHA256, keyed by the base64 bytes
after `whsec_`, over `` `${webhook-id}.${webhook-timestamp}.${body}` ``, in
base64, prefixed with `v1,`. Any Standard Webhooks library verifies it; so
does [`verifyWebhook`](receiving.md).

## Secrets and rotation

```ts
import { mintWebhookSecret } from '@nxgt/janus-webhooks';

mintWebhookSecret(); // 'whsec_' and 32 random bytes in base64
```

Mint one per endpoint, once, and give it to both sides — the sender's
configuration and the receiver's. A secret is at least 24 bytes of base64
after `whsec_`; one minted by another Standard Webhooks library is accepted
as it stands when it holds that much.

To rotate one without losing a request, **sign with both, let the receiver
accept both, then drop the old one**:

```ts
// 1. The sender signs with both: every request carries two signatures, and a
//    receiver that knows either secret accepts it.
webhooks({ endpoints: [{ url, secrets: [oldSecret, nextSecret] }] });

// 2. The receiver accepts both.
verifyWebhook({ secrets: [nextSecret, oldSecret], headers, body });

// 3. Once every sending process runs with both, the sender drops the old one…
webhooks({ endpoints: [{ url, secrets: [nextSecret] }] });

// 4. …and once every sending process runs without it, so does the receiver.
verifyWebhook({ secrets: [nextSecret], headers, body });
```

The secrets are read once, when `webhooks()` is called: a process keeps
signing with the ones it started with, retries included, until it restarts.

## In a test

Pass a `fetch` of your own, and read back what it was sent with
`verifyWebhook`:

```ts
import { expect, it } from 'bun:test';
import { createMemoryStores, janus, scryptHasher, type UserEvent } from '@nxgt/janus';
import { mintWebhookSecret, verifyWebhook, webhooks } from '@nxgt/janus-webhooks';
import { z } from 'zod';

it('tells the CRM about a sign-up', async () => {
	const secret = mintWebhookSecret();
	const received: (UserEvent | null)[] = [];
	const hooks = webhooks({
		endpoints: [{ url: 'https://crm.example.test/hooks', secrets: [secret] }],
		retries: [],
		fetch: (async (input: string, init: RequestInit) => {
			const request = new Request(input, init);
			received.push(verifyWebhook({ secrets: [secret], headers: request.headers, body: await request.text() }));
			return new Response(null, { status: 204 });
		}) as typeof fetch,
	});
	const auth = janus({
		user: z.object({ email: z.email() }),
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher: scryptHasher({ cost: 10 }),
		events: hooks,
	});

	const { user } = await auth.signUp({ email: 'ada@example.com', password: 'correct horse' });
	await hooks.close(); // waits for the request in flight

	expect(received).toEqual([expect.objectContaining({ type: 'user.created', userId: user.id })]);
});
```

To test a retry or giving up, answer a failing status and pass short
`retries` — `['5ms']` — and an `onGivingUp` that records what it receives.

## Signatures

```ts
interface WebhookEndpoint {
	readonly url: string;
	readonly secrets: readonly [string, ...string[]];
	readonly types?: readonly UserEventType[];
}

interface WebhooksOptions {
	readonly endpoints: readonly WebhookEndpoint[];
	readonly retries?: readonly Duration[];
	readonly timeout?: Duration;
	readonly onGivingUp?: (delivery: Delivery, reason: GivingUp) => void | Promise<void>;
	readonly fetch?: typeof fetch;
}

interface Webhooks {
	(event: UserEvent): void; // a UserEventListener: janus({ events: hooks })
	close(): Promise<void>;
}

function webhooks(options: WebhooksOptions): Webhooks;
function mintWebhookSecret(): string;
```

## See also

- [Receiving webhooks](receiving.md) — the other side of the wire
- [User events in `@nxgt/janus`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/events.md) — the four types, and when the listener runs
- [Troubleshooting](../troubleshooting.md) — the wiring refusals and the warnings
