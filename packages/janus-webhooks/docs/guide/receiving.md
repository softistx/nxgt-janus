# Receiving webhooks

This page is for the endpoint's side: checking that a request carries a user
event the sender signed, answering it so the sender knows whether to retry,
and handling each event once.

```ts
import { verifyWebhook } from '@nxgt/janus-webhooks';

const secret = process.env.WEBHOOK_SECRET;
if (!secret) throw new Error('WEBHOOK_SECRET is not set');

export const receive = async (request: Request): Promise<Response> => {
	const event = verifyWebhook({
		secrets: [secret],
		headers: request.headers,
		body: await request.text(), // the raw body, before any parsing
	});
	if (event === null) return new Response(null, { status: 401 });

	console.log(event);
	// { id: '0199…', type: 'user.created', occurredAt: Date, userId: '0199…', userType: 'user' }
	return new Response(null, { status: 204 });
};
```

`verifyWebhook` answers the `UserEvent` the request carries — the same
object the sender's `janus` handed its listener — or `null`. It never throws
for a request: only for its own configuration.

## Options

```ts
verifyWebhook({ secrets, headers, body, toleranceSeconds?, now? });
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `secrets` | `readonly string[]` | required, at least one | The endpoint's secrets. Every one is tried, so a [rotation](#rotating-a-secret) drops no request |
| `headers` | `Headers \| Readonly<Record<string, string \| readonly string[] \| undefined>>` | required | The request's headers: a fetch `Headers`, or a header record — its keys read whatever their case |
| `body` | `string` | required | The body **as received**. The signature covers its bytes |
| `toleranceSeconds` | `number` | `300` | How far `webhook-timestamp` may be from `now`, before or after |
| `now` | `Date` | `new Date()` | The time the timestamp is checked against: a fixed one in a test |

```ts
// A tighter window, for clocks you keep in sync.
verifyWebhook({ secrets, headers, body, toleranceSeconds: 60 });
```

## What it answers

The event, frozen:

```ts
interface UserEvent {
	readonly id: string; // the webhook-id header: the key to handle it once
	readonly type: 'user.created' | 'user.emailVerified' | 'user.passwordReset' | 'user.deleted';
	readonly occurredAt: Date; // the body's timestamp: when the write landed
	readonly userId: string;
	readonly userType: string;
}
```

It names the user by id, and nothing else. Read the rest from where it is
kept — an API of the sender's, `auth.get(event.userId)` when you share its
store — if you may. [The four types](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/events.md#the-four-types)
are a closed union, so a `switch` on `event.type` is exhaustive.

**`null`** when the request is not a user event these secrets signed:

| Cause | Typically |
| --- | --- |
| `webhook-id`, `webhook-timestamp` or `webhook-signature` is missing | a request that is not a webhook; a proxy that dropped it |
| `webhook-timestamp` is not whole seconds | a forgery, or a sender that is not a Standard Webhooks one |
| `webhook-timestamp` is more than `toleranceSeconds` from `now` | a replay, or a clock that drifted — the receiver's or the sender's |
| no `v1` signature in `webhook-signature` matches one of `secrets` | a forgery; an altered body; the wrong secret; a body that was parsed and serialised again before the check |
| the body is not JSON, or not a user event | a `type` other than the four, a `timestamp` that is not a date, `data.userId` or `data.userType` not a string |

The signatures are compared in constant time. `null` says nothing about which
check failed, on purpose: a caller probing the endpoint learns nothing.

**A `TypeError`** only for the configuration — `secrets` is yours, never the
request's:

| Message | Cause |
| --- | --- |
| `verifyWebhook: pass the endpoint's secrets — at least one` | `secrets: []`, or `secrets` missing or not an array |
| `verifyWebhook: a secret is written whsec_<base64> — make one with mintWebhookSecret()` | a secret without the `whsec_` prefix, or not a string |
| `verifyWebhook: a secret holds at least 24 bytes of base64 after whsec_ — make one with mintWebhookSecret()` | a secret too short, or not base64 |
| `verifyWebhook: toleranceSeconds is a finite number of seconds, 0 or more` | `NaN` — `Number(process.env.X)` with `X` unset — a negative number, or `Infinity`: each would let every timestamp through |
| `verifyWebhook: now is a valid Date` | an Invalid Date, which would let every timestamp through too |

## The raw body

The signature is over the bytes the sender posted. Read the body as text and
verify it **before** anything parses it; parse nothing yourself afterwards —
the event `verifyWebhook` answers is already read from it. A JSON body parser
that runs first and hands you `JSON.stringify(parsed)` changes the bytes
(spacing, key order, escapes), and every request answers `null`.

With [Hono](https://hono.dev):

```ts
import { verifyWebhook } from '@nxgt/janus-webhooks';
import { Hono } from 'hono';

export const app = new Hono().post('/hooks/janus', async (c) => {
	const event = verifyWebhook({ secrets, headers: c.req.raw.headers, body: await c.req.text() });
	if (event === null) return c.body(null, 401);

	await onUserEvent(event);
	return c.body(null, 204);
});
```

With Node's `http` module, whose `req.headers` is a header record:

```ts
import { createServer } from 'node:http';
import { verifyWebhook } from '@nxgt/janus-webhooks';

createServer(async (req, res) => {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk as Buffer);

	const event = verifyWebhook({
		secrets,
		headers: req.headers,
		body: Buffer.concat(chunks).toString('utf8'),
	});
	if (event === null) return void res.writeHead(401).end();

	await onUserEvent(event);
	res.writeHead(204).end();
}).listen(3000);
```

## What to answer

The sender retries anything that is not a `2xx`, and follows no redirect:

| Situation | Answer | The sender then |
| --- | --- | --- |
| `null` | `401` (or `400`) | retries on its schedule. A forger gets nothing; a genuine request refused for a drifted clock is signed again, with a fresh timestamp, at each retry |
| an event, handled | `2xx` — `204` | stops: delivered |
| an event already handled — a retry, or a replay | `2xx`, doing nothing | stops |
| an event you could not handle now — your database is down | `5xx` — `503` | retries it later |
| a redirect | — | counts it a failure: give the sender the final URL |

Answer within the sender's timeout — ten seconds by default — or the attempt
fails and is sent again even though you handled it. Work that takes longer
goes in a queue: store the event, answer `204`, handle it after.

## Handling each event once

A request verifies more than once: a retry after an answer the sender did not
get in time, or a request copied and **replayed inside the tolerance**. Both
carry the same id. Keep the ids handled — a unique index — and answer a
second with a `2xx`:

```ts
import type { UserEvent } from '@nxgt/janus';
import { verifyWebhook } from '@nxgt/janus-webhooks';

interface Handled {
	/** true when the id was not claimed before: an insert on a unique key. */
	claim(id: string): Promise<boolean>;
	release(id: string): Promise<void>;
}

export function receiver(options: {
	secrets: readonly string[];
	handled: Handled;
	onUserEvent: (event: UserEvent) => Promise<void>;
}) {
	return async (request: Request): Promise<Response> => {
		const event = verifyWebhook({
			secrets: options.secrets,
			headers: request.headers,
			body: await request.text(),
		});
		if (event === null) return new Response(null, { status: 401 });
		if (!(await options.handled.claim(event.id))) return new Response(null, { status: 204 });

		try {
			await options.onUserEvent(event);
		} catch {
			await options.handled.release(event.id); // let the retry through
			return new Response(null, { status: 503 });
		}
		return new Response(null, { status: 204 });
	};
}
```

Keep an id at least as long as the sender retries — a day and more with the
default schedule — plus the tolerance.

**Order** is not promised: a retry arrives after events sent since, and two
sending processes each deliver their own. `occurredAt`, and the `id` — a
UUIDv7, which sorts by time — let you put them back in order, or ignore an
event older than what you already hold for that user.

## Rotating a secret

The sender signs with every secret it holds, so while one is rotated each
request carries two signatures, and a receiver that knows either accepts it.
List both on the receiving side until every sender runs without the old one:

```ts
verifyWebhook({ secrets: [nextSecret, oldSecret], headers, body });
```

The steps, on both sides, are in
[the sending guide](sending.md#secrets-and-rotation).

## Without this package

The format is the [Standard Webhooks](https://www.standardwebhooks.com)
specification's, and so is the signature: a receiver written in another
language, or with another library, verifies these requests with any
implementation of it, given the same `whsec_` secret. The headers and body
are in [the wire format](sending.md#the-wire-format).

## In a test

Let `webhooks()` sign a real request, and hand it to your handler: a `fetch`
of your own is the endpoint.

```ts
import { expect, it } from 'bun:test';
import type { UserEvent } from '@nxgt/janus';
import { mintWebhookSecret, verifyWebhook, webhooks } from '@nxgt/janus-webhooks';

it('handles a user event once, and refuses a forgery', async () => {
	const secret = mintWebhookSecret();
	const handled: UserEvent[] = [];
	const receive = async (request: Request): Promise<Response> => {
		const event = verifyWebhook({ secrets: [secret], headers: request.headers, body: await request.text() });
		if (event === null) return new Response(null, { status: 401 });
		if (!handled.some((one) => one.id === event.id)) handled.push(event);
		return new Response(null, { status: 204 });
	};

	const listener = webhooks({
		endpoints: [{ url: 'https://receiver.example.test/hooks', secrets: [secret] }],
		retries: [],
		fetch: ((input: string, init: RequestInit) => receive(new Request(input, init))) as typeof fetch,
	});
	const event: UserEvent = {
		id: '0199a0db-f800-7000-8000-000000000001',
		type: 'user.created',
		occurredAt: new Date(Date.UTC(2026, 8, 26, 11, 59)),
		userId: '0199a0db-f800-7000-8000-000000000002',
		userType: 'user',
	};
	listener(event);
	listener(event); // the same id twice: handled once
	await listener.close();

	expect(handled).toEqual([event]);

	const forged = new Request('https://receiver.example.test/hooks', {
		method: 'POST',
		headers: { 'webhook-id': event.id, 'webhook-timestamp': '1', 'webhook-signature': 'v1,Zm9yZ2Vk' },
		body: '{}',
	});
	expect((await receive(forged)).status).toBe(401);
});
```

For a stored request whose timestamp is fixed, pass `now` rather than
widening `toleranceSeconds`.

## Signatures

```ts
type HeadersLike = Headers | Readonly<Record<string, string | readonly string[] | undefined>>;

interface VerifyOptions {
	readonly secrets: readonly [string, ...string[]];
	readonly headers: HeadersLike;
	readonly body: string;
	readonly toleranceSeconds?: number;
	readonly now?: Date;
}

function verifyWebhook(options: VerifyOptions): UserEvent | null;
```

## See also

- [Sending webhooks](sending.md) — the retry schedule, the wire format, rotation on the sender's side
- [Troubleshooting](../troubleshooting.md) — a receiver that answers `null` for requests you sent
