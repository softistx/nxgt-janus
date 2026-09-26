# @nxgt/janus-webhooks

[`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) user events,
delivered as signed webhooks by the
[Standard Webhooks](https://www.standardwebhooks.com) specification: each
user event is posted to your endpoints, signed with HMAC-SHA256, retried on
failure, and every delivery given up is reported, never dropped without a
word. The receiving side checks the signature with `verifyWebhook`, or with
any Standard Webhooks library.

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
	events: listener, // every user.created, user.emailVerified, user.passwordReset, user.deleted
});

process.on('SIGTERM', async () => {
	await listener.close(); // waits for requests in flight, gives up the retries still waiting
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

Both peers are required: `@nxgt/janus` (0.8, the release with user events)
and `typescript` (6). `@nxgt/janus` is a **peer**, so one copy of it defines
`UserEvent`. Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`.
It uses `node:crypto`, the global `fetch` and `process.emitWarning`: Bun or
Node.

## Usage

### Sending — `webhooks()`

`webhooks({ endpoints })` answers the listener `janus({ events })` takes,
with a `close()` for shutdown. It posts each user event to every endpoint
whose `types` include it — all four types when `types` is absent:

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
		// reason.why: 'retriesRanOut' | 'closed'; delivery.attempts: how many requests were sent
		await deadLetters.insert({ eventId: delivery.event.id, url: delivery.url, ...reason });
	},
});
```

The [sending guide](docs/guide/sending.md) has every option, the retry
schedule, when a delivery is given up and why, the wire format, and a test.

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

## API

| Export | What it is |
| --- | --- |
| `webhooks(options)` | The listener for `janus({ events })`, and `close()`. Options: `endpoints` (each `{ url, secrets, types? }`), `retries`, `timeout`, `onGivingUp`, `fetch`. Wiring mistakes are a `TypeError` when it is called |
| `verifyWebhook(options)` | `{ secrets, headers, body, toleranceSeconds?, now? }` → `UserEvent \| null`. Headers as a fetch `Headers` or a Node header record. No secret, or a malformed one, is a `TypeError` |
| `mintWebhookSecret()` | A new `whsec_` secret for an endpoint |
| `WebhooksOptions`, `WebhookEndpoint`, `Webhooks` | What `webhooks()` takes and answers |
| `Delivery`, `GivingUp`, `Failure` | What `onGivingUp` receives: `{ event, url, attempts }`, and `{ why, status, error }` — a `GivingUp` is a `Failure`, what the last attempt got, with the reason |
| `VerifyOptions`, `HeadersLike`, `WebhookBody` | What `verifyWebhook` takes, and the JSON body on the wire |

## Traps

**Retries wait in memory.** A crash, or an exit without `close()`, loses
every retry still waiting, and nothing sends it later: on top of
`@nxgt/janus`'s own *at most once, from the process that wrote*, an endpoint
may miss an event. A durable queue is on the [roadmap](docs/roadmap.md);
until then, build what must not miss one to also read the users now and then.

**Call `close()` on shutdown.** It waits for the requests in flight and gives
up the retries still waiting, each reported as `closed` — without it they
vanish without a word. `process.on('SIGTERM', () => listener.close())`.

**The listener never makes a flow wait.** It starts the first request at once
and returns, so `signUp` answers before any endpoint does: `janus` awaiting
its listener buys no durability here. A retry's timer does not hold the
process open either — end a script with `await listener.close()`.

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

**The warnings name the URL's origin, never the URL.** `JANUS_WEBHOOK_GAVE_UP`
writes `https://crm.example.com` because a path or query may hold a token of
the receiver's; `onGivingUp` receives the full `delivery.url`, so do not log
it as it stands.

The symptoms and fixes are in [troubleshooting](docs/troubleshooting.md).

## Type safety, counted

**Six plausible mistakes, six refused at compile time.**
`test/types/webhooks.ts` holds one `@ts-expect-error` per mistake, beside the
wiring that must keep compiling (`janus({ events: webhooks(…) })`): an
endpoint with no secret, a secret read from the environment and not checked
(`string | undefined`), a type `janus` never sends, a retry that is not a
`Duration`, a receiver with no secret, and reading a verified event before
checking it for `null`.

## Documentation

- [Guides](docs/README.md) — sending and receiving, every option with an example
- [Troubleshooting](docs/troubleshooting.md) — by the warning or error you see
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned

## Licence

MIT
