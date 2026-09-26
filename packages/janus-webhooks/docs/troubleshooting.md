# Troubleshooting `@nxgt/janus-webhooks`

Each entry is headed by the text you see: a message, a warning, a compiler
error, or a symptom. Search this page for the words of your message.

How the messages are shaped:

- **Every message starts with the call you wrote**: `webhooks: …` or
  `verifyWebhook: …`. Below, `<call>` stands for either one, where both can
  print the message.
- **A `TypeError` is a wiring mistake**: it comes from how the application was
  put together — an endpoint, a secret, a duration — and never from a request.
  It is thrown when `webhooks()` or `verifyWebhook()` is called, so fix the
  configuration; no handler should answer one.
- **A delivery that fails is never thrown.** The listener returns at once and
  the flow of `@nxgt/janus` answers as usual; a delivery that runs out of
  retries goes to your `onGivingUp`, or is a `JANUS_WEBHOOK_GAVE_UP` process
  warning without one.
- **`verifyWebhook` answers `null`** for any request it cannot vouch for, and
  never says why: a forger learns nothing from the answer.

## Index

**Configuring `webhooks()`**
- [`webhooks: pass at least one endpoint`](#webhooks-pass-at-least-one-endpoint)
- [`webhooks: an endpoint's url is not a URL`](#webhooks-an-endpoints-url-is-not-a-url)
- [`webhooks: an endpoint's url must be https:// — http:// only to localhost`](#webhooks-an-endpoints-url-must-be-https--http-only-to-localhost)
- [`webhooks: an endpoint needs at least one secret`](#webhooks-an-endpoint-needs-at-least-one-secret)
- [`<call>: a secret is written whsec_<base64> — make one with mintWebhookSecret()`](#call-a-secret-is-written-whsec_base64--make-one-with-mintwebhooksecret)
- [`<call>: a secret holds at least 24 bytes of base64 after whsec_ — make one with mintWebhookSecret()`](#call-a-secret-holds-at-least-24-bytes-of-base64-after-whsec_--make-one-with-mintwebhooksecret)
- [`webhooks: an endpoint's types are user event types — user.created, user.emailVerified, user.passwordReset, user.deleted`](#webhooks-an-endpoints-types-are-user-event-types--usercreated-useremailverified-userpasswordreset-userdeleted)
- [`webhooks: retries: "<value>" is not a duration; write a number followed by ms, s, m, h or d — for example "15m" or "720h"`](#webhooks-retries-value-is-not-a-duration-write-a-number-followed-by-ms-s-m-h-or-d--for-example-15m-or-720h)
- [`webhooks: retries: a duration in milliseconds must be a finite number above zero`](#webhooks-retries-a-duration-in-milliseconds-must-be-a-finite-number-above-zero)
- [`verifyWebhook: pass the endpoint's secrets — at least one`](#verifywebhook-pass-the-endpoints-secrets--at-least-one)

**Types**
- [`TS2322: Type 'string | undefined' is not assignable to type 'string'.`](#ts2322-type-string--undefined-is-not-assignable-to-type-string)
- [`TS2322: Type 'string[]' is not assignable to type 'readonly [string, ...string[]]'.`](#ts2322-type-string-is-not-assignable-to-type-readonly-string-string)

**Delivering**
- [`[JANUS_WEBHOOK_GAVE_UP] Warning: webhooks: gave up <type> <event id> to <origin> after <n> attempts (<why>, <status or error>)`](#janus_webhook_gave_up-warning-webhooks-gave-up-type-event-id-to-origin-after-n-attempts-why-status-or-error)
- [`[JANUS_WEBHOOK_REPORT_FAILED] Warning: webhooks: onGivingUp failed on <type> <event id>: <name>`](#janus_webhook_report_failed-warning-webhooks-ongivingup-failed-on-type-event-id-name)
- [A redirect is counted as a failure](#a-redirect-is-counted-as-a-failure)
- [Events are lost when the process exits](#events-are-lost-when-the-process-exits)
- [An endpoint receives nothing, and nothing is given up](#an-endpoint-receives-nothing-and-nothing-is-given-up)

**Receiving**
- [`verifyWebhook` answers `null`](#verifywebhook-answers-null)
- [A webhook is received twice](#a-webhook-is-received-twice)

---

## Configuring `webhooks()`

### `webhooks: pass at least one endpoint`

**When:** calling `webhooks({ … })` with no `endpoints`, or an empty array —
typically a list built from the environment that came back empty.
**Why:** a delivery with nowhere to go would drop every event in silence.
**Fix:** pass at least one endpoint, or do not pass `events` to `janus()` at
all when there is none:

```ts
import { webhooks } from '@nxgt/janus-webhooks';

const url = process.env.WEBHOOK_URL;
const secret = process.env.WEBHOOK_SECRET;
const events =
  url && secret ? webhooks({ endpoints: [{ url, secrets: [secret] }] }) : undefined;
```

### `webhooks: an endpoint's url is not a URL`

**When:** calling `webhooks({ … })` with an endpoint whose `url` is missing,
relative (`'/hooks'`), or has no scheme (`'hooks.example.com/janus'`).
**Why:** the URL is parsed with `new URL(url)`, with no base to resolve it
against.
**Fix:** write the absolute URL, scheme included:

```ts
webhooks({ endpoints: [{ url: 'https://hooks.example.com/janus', secrets: [secret] }] });
```

### `webhooks: an endpoint's url must be https:// — http:// only to localhost`

**When:** calling `webhooks({ … })` with an `http://` URL to any host other
than `localhost`, `127.0.0.1` or `[::1]` — including a service name on a
container network (`http://receiver:3000/hooks`) or `0.0.0.0`.
**Why:** the body and the signature headers would cross the network in clear.
Plain HTTP is accepted only where it cannot leave the machine, for
development.
**Fix:** serve the receiver over HTTPS; in development, reach it through
`localhost`:

```ts
const url = process.env.NODE_ENV === 'production'
  ? 'https://hooks.example.com/janus'
  : 'http://localhost:3000/janus';
```

### `webhooks: an endpoint needs at least one secret`

**When:** calling `webhooks({ … })` from JavaScript, or through a cast, with
an endpoint whose `secrets` is absent or `[]`.
**Why:** an unsigned webhook cannot be told from a forged one. TypeScript
refuses the same mistake at compile time — see
[`TS2322: Type 'string[]' is not assignable …`](#ts2322-type-string-is-not-assignable-to-type-readonly-string-string).
**Fix:** list the secret the receiver verifies with — two while rotating:

```ts
webhooks({ endpoints: [{ url, secrets: [secret] }] });
webhooks({ endpoints: [{ url, secrets: [nextSecret, secret] }] }); // during a rotation
```

### `<call>: a secret is written whsec_<base64> — make one with mintWebhookSecret()`

**When:** calling `webhooks({ … })` or `verifyWebhook({ … })` with a secret
that is not a string starting with `whsec_` — most often `undefined`, from an
environment variable that is not set, or a bare random string.
**Why:** secrets follow the Standard Webhooks format: `whsec_` then the key in
base64. The prefix is how a secret is told from any other string.
**Fix:** mint one, once, and store it where both sides read it:

```ts
import { mintWebhookSecret } from '@nxgt/janus-webhooks';

console.log(mintWebhookSecret()); // whsec_… — 32 random bytes; put it in your secret store
```

A secret issued by another Standard Webhooks sender already has the right
shape.

### `<call>: a secret holds at least 24 bytes of base64 after whsec_ — make one with mintWebhookSecret()`

**When:** calling `webhooks({ … })` or `verifyWebhook({ … })` with a secret
that starts with `whsec_` but:
- holds fewer than 24 bytes once decoded — a short or truncated secret;
- is not plain base64 — base64url (`-` and `_`), spaces, or a **trailing
  newline** kept from a secret file or a `.env` line.

**Why:** the Standard Webhooks specification asks for at least 24 bytes, and
the secret must decode to exactly what it says: a secret that decodes loosely
would sign with another key than the one the receiver holds.
**Fix:** trim what you read, and mint a new secret if it is too short:

```ts
const secret = process.env.WEBHOOK_SECRET?.trim();
```

### `webhooks: an endpoint's types are user event types — user.created, user.emailVerified, user.passwordReset, user.deleted`

**When:** calling `webhooks({ … })` with an endpoint whose `types` is not an
array (`types: 'user.created'`), or names a type `@nxgt/janus` does not send
(`'user.signedIn'`, `'user.updated'`).
**Why:** a filter on a type that never comes would leave the endpoint waiting
for nothing. The message lists the types there are.
**Fix:** an array of those types, or no `types` for every one:

```ts
webhooks({
  endpoints: [{ url, secrets: [secret], types: ['user.created', 'user.deleted'] }],
});
```

### `webhooks: retries: "<value>" is not a duration; write a number followed by ms, s, m, h or d — for example "15m" or "720h"`

The same with `webhooks: timeout:` for the request timeout.

**When:** calling `webhooks({ … })` with a `retries` entry or a `timeout`
written in a shape that is not a duration: `'soon'`, `'5 min'`, `'1h30m'`,
`'5S'`.
**Why:** a duration is a number of milliseconds, or one number followed by one
lowercase unit.
**Fix:**

```ts
webhooks({ endpoints, retries: ['30s', '5m', '1h'], timeout: '5s' });
```

### `webhooks: retries: a duration in milliseconds must be a finite number above zero`

Also `webhooks: timeout: a duration in milliseconds must be a finite number
above zero`, and `webhooks: <retries|timeout>: a duration must be above zero`
for a string such as `'0s'`.

**When:** calling `webhooks({ … })` with `0`, a negative number, `NaN` or
`Infinity` as a retry delay or the timeout — often `retries: [0]` meant as
"retry at once", or `timeout: 0` meant as "no timeout".
**Why:** each delay and the timeout must be above zero. There is no "no
timeout": a request that never answers would hold its delivery forever.
**Fix:** a short delay for an immediate retry, and a real timeout; to send
once without any retry, pass an empty list:

```ts
webhooks({ endpoints, retries: [] });           // one attempt, no retry
webhooks({ endpoints, retries: ['1s', '1m'] }); // three attempts
```

### `verifyWebhook: pass the endpoint's secrets — at least one`

**When:** calling `verifyWebhook({ secrets: [], … })`.
**Why:** with no secret, no request can be verified; answering `null` to every
one would look like a forgery attack instead of a configuration mistake.
**Fix:** pass the endpoint's secrets — the same ones the sender lists for
this endpoint, and during a rotation both:

```ts
const secrets = [process.env.WEBHOOK_SECRET, process.env.WEBHOOK_SECRET_NEXT].filter(
  (secret): secret is string => secret !== undefined,
);
```

Leaving `secrets` out entirely is refused with the same message.

## Types

### `TS2322: Type 'string | undefined' is not assignable to type 'string'.`

**When:** `tsc`, on `secrets: [process.env.WEBHOOK_SECRET]`.
**Why:** an environment variable may be unset, and a secret may not be
missing.
**Fix:** read it once at startup, and fail there when it is absent:

```ts
const secret = process.env.WEBHOOK_SECRET;
if (secret === undefined) throw new Error('WEBHOOK_SECRET is not set');

webhooks({ endpoints: [{ url, secrets: [secret] }] });
```

### `TS2322: Type 'string[]' is not assignable to type 'readonly [string, ...string[]]'.`

Followed by `Source provides no match for required element at position 0 in
target.`

**When:** `tsc`, on `secrets: list` where `list` is a `string[]` — read from a
comma-separated variable, for instance.
**Why:** `secrets` holds at least one secret, and a `string[]` may be empty.
**Fix:** check that it is not, then pass it as a non-empty tuple:

```ts
const [first, ...rest] = (process.env.WEBHOOK_SECRETS ?? '').split(',').filter(Boolean);
if (first === undefined) throw new Error('WEBHOOK_SECRETS is empty');

webhooks({ endpoints: [{ url, secrets: [first, ...rest] }] });
```

## Delivering

### `[JANUS_WEBHOOK_GAVE_UP] Warning: webhooks: gave up <type> <event id> to <origin> after <n> attempts (<why>, <status or error>)`

A process warning, not a thrown error. It names the endpoint by its origin
only: the path and the query, which may hold a token of the receiver's, are
never printed.

**When:** a delivery was given up, and no `onGivingUp` was passed. What the
parentheses hold:

| Shown | Meaning |
| --- | --- |
| `(retriesRanOut, 503)` | every attempt failed; the last one was answered with that status — any status outside `2xx`, a redirect included |
| `(retriesRanOut, TimeoutError)` | the last request took longer than `timeout` (`'10s'` by default) |
| `(retriesRanOut, TypeError)` | the last request got no answer: DNS, a refused connection, TLS |
| `(closed, 503)`, `(closed, TimeoutError)` | `close()` was called while the delivery waited for a retry, or while an attempt was in flight that then failed with a retry left: the last attempt's status or failure |
| `after 0 attempts (closed, no answer)` | the event arrived after `close()`: nothing was sent |

With the default schedule, a delivery is retried for more than a day
(`5s`, `5m`, `30m`, `2h`, `5h`, `10h`, `10h`, eight attempts), so this warning
comes about 27 hours after the event.
**Why:** the endpoint was down, failing, too slow, redirecting, or
unreachable for all that time. The event is not sent again.
**Fix:** pass `onGivingUp` and keep what it is given, so the event can be sent
again once the endpoint is back — `delivery.event` is the whole event:

```ts
const hooks = webhooks({
  endpoints,
  onGivingUp: async (delivery, reason) => {
    await deadLetters.insert({ event: delivery.event, url: delivery.url, ...reason });
  },
});
```

To at least see the warning in your logs — it is hidden by `--no-warnings` or
`NODE_NO_WARNINGS=1`:

```ts
process.on('warning', (warning) => {
  if ((warning as { code?: string }).code === 'JANUS_WEBHOOK_GAVE_UP') logger.error(warning.message);
});
```

### `[JANUS_WEBHOOK_REPORT_FAILED] Warning: webhooks: onGivingUp failed on <type> <event id>: <name>`

**When:** a delivery was given up, and your `onGivingUp` threw or rejected —
the dead-letter store was down, a bug in the callback.
**Why:** a callback's failure has nowhere else to go. The warning names the
event and the failure's name — never its message, which may hold anything.
The delivery is now lost: it is not retried, and `onGivingUp` is not called
again.
**Fix:** make `onGivingUp` unable to lose what it is given — catch inside it,
and fall back to a log line that holds the event:

```ts
onGivingUp: async (delivery, reason) => {
  try {
    await deadLetters.insert({ event: delivery.event, url: delivery.url, ...reason });
  } catch {
    logger.error({ event: delivery.event, reason }, 'webhook given up, and not stored');
  }
},
```

The warning holds the event's type and `id`, not the user's id: to find what
was lost, reconcile the receiver's copy against the users themselves, as in
`@nxgt/janus`'s
[An event you expected never arrived](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md#an-event-you-expected-never-arrived).

### A redirect is counted as a failure

**When:** an endpoint that works in a browser or with `curl -L` never
receives a webhook, and every delivery is given up with a `3xx` status:
`(retriesRanOut, 301)`, `302`, `307`, `308`.
**Why:** a request succeeds on a `2xx` and nothing else. Redirects are not
followed: a signed request re-sent to wherever a `Location` points would
carry the signature to a host you did not name. Common redirects: `http` to
`https`, a missing trailing slash (`/hooks` to `/hooks/`), the bare domain to
`www`, a moved route.
**Fix:** point the endpoint at the final URL — one a `POST` does not answer
with a `3xx`, as `curl -s -o /dev/null -w '%{http_code}' -X POST <url>`
shows:

```ts
webhooks({ endpoints: [{ url: 'https://www.example.com/hooks/', secrets: [secret] }] });
```

Following redirects is [not planned](roadmap.md#not-planned).

### Events are lost when the process exits

**When:** after a deploy, a restart or a crash, an endpoint that was down for
a moment never receives some events — and no `JANUS_WEBHOOK_GAVE_UP` warning
or `onGivingUp` call says so.
**Why:** retries wait **in memory**, on timers that do not hold the process
open. A process that exits without calling `close()` drops them with no trace.
`close()` waits for the requests in flight and gives up each retry still
waiting as `closed`, so it reaches `onGivingUp`. A crash (`SIGKILL`, out of
memory) runs nothing at all.
**Fix:** stop taking requests first, so no new event comes, then `close()`:

```ts
const hooks = webhooks({ endpoints, onGivingUp });
const auth = janus({ ...options, events: hooks });

process.on('SIGTERM', async () => {
  server.stop();
  await hooks.close();
  process.exit(0);
});
```

On a platform that freezes the process as soon as a response is sent, the
first request itself may not leave: the listener starts it and returns at
once. There, pass `janus({ events })` a listener of your own that stores the
event durably, and deliver from a worker. A durable queue for retries is on
the [roadmap](roadmap.md#next); until then, reconcile against the users
themselves as shown in `@nxgt/janus`'s
[An event you expected never arrived](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md#an-event-you-expected-never-arrived).

### An endpoint receives nothing, and nothing is given up

**When:** events happen, the endpoint sees no request, and there is no
`JANUS_WEBHOOK_GAVE_UP` warning.
**Why:** one of these:
- the endpoint's `types` does not name the event's type — `types: []` names
  none, and the endpoint receives nothing at all;
- `janus()` was given another listener than the one `webhooks()` answered, or
  none — each `janus()` instance takes its own `events`;
- the process exited while a retry waited — see
  [Events are lost when the process exits](#events-are-lost-when-the-process-exits);
- the flow wrote nothing, so no event was sent — see `@nxgt/janus`'s
  [An event you expected never arrived](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md#an-event-you-expected-never-arrived).

**Fix:** leave `types` out to receive every type, and hand the same
`webhooks()` to every `janus()` that should send:

```ts
const hooks = webhooks({ endpoints: [{ url, secrets: [secret] }] });
const auth = janus({ ...options, events: hooks });
```

## Receiving

### `verifyWebhook` answers `null`

**When:** your receiver calls `verifyWebhook({ secrets, headers, body })` on a
request the sender did send, and gets `null`.
**Why:** `null` means "not a request these secrets signed, now" — and on
purpose it never says which check failed. In order of likelihood:
- **the body was parsed before verifying.** The signature covers the bytes
  sent; `JSON.stringify(await c.req.json())` or a JSON body parser gives back
  other bytes (spacing, key order, escapes). Pass the raw text;
- **the secret is not the endpoint's** — another environment's, or the old one
  removed from the receiver before the sender stopped signing with it. Rotate
  by adding the new secret on the receiver first, then on the sender, then
  removing the old one from the sender, then from the receiver;
- **the clocks disagree** by more than `toleranceSeconds` (`300` by default),
  in either direction — or the request was verified late, from a queue,
  rather than when it arrived;
- **the `webhook-id`, `webhook-timestamp` or `webhook-signature` header is
  missing** — dropped by a proxy, a gateway or a CDN in front of the
  receiver;
- **the request is not from `webhooks()`**: another sender whose timestamp is
  in milliseconds, whose signature is not `v1,…`, or whose body is not one of
  the four user event types — a newer sender with a type this receiver does
  not know yet included.

**Fix:** verify first, on the raw body and the request's own headers, and
answer `401` to `null` without acting on it:

```ts
import { verifyWebhook } from '@nxgt/janus-webhooks';
import { Hono } from 'hono';

const app = new Hono();

app.post('/hooks/janus', async (c) => {
  const event = verifyWebhook({
    secrets: [secret],
    headers: c.req.raw.headers,
    body: await c.req.text(), // the raw text, never a parsed and re-serialised body
  });
  if (event === null) return c.body(null, 401);

  await handle(event);
  return c.body(null, 204);
});
```

With Express, take the body raw on that route —
`express.raw({ type: 'application/json' })` — and pass
`req.body.toString('utf8')`. With a plain object of headers in any case, pass
`new Headers(headers)`. Check the clocks (NTP) before raising
`toleranceSeconds`: a wider window is a wider window for replays.

### A webhook is received twice

**When:** your receiver handles the same event two times or more — the same
`webhook-id` header, and the same `id` on what `verifyWebhook` answers.
**Why:** delivery is at least once. A request is sent again when the previous
one did not answer `2xx` in time: the receiver did the work but answered
after `timeout` (`'10s'` by default), answered a redirect or an error after
doing it, or the connection dropped before the answer arrived. Two endpoint
entries with the same URL also each send. And a request captured on the way
can be replayed within the `300`-second tolerance: its signature is still
valid.
**Fix:** keep the ids already handled — it is what the id is for — and
answer `2xx` to a second one without doing anything:

```ts
const event = verifyWebhook({ secrets, headers: c.req.raw.headers, body: await c.req.text() });
if (event === null) return c.body(null, 401);

// A unique index on id: inserting an id already there does nothing and answers false.
if (!(await handledEvents.insertIfAbsent(event.id))) return c.body(null, 204);

await handle(event);
return c.body(null, 204);
```

Answer fast and do slow work after, so a request is not retried for being
slow. Keep the ids longer than the retry schedule — two days covers the
default one.
