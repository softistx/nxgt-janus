# Troubleshooting `@nxgt/janus-webhooks`

Each entry is headed by the text you see: a message, a warning, a compiler
error, or a symptom. Search this page for the words of your message.

How the messages are shaped:

- **Every message starts with the call you wrote**: `webhooks: …` or
  `verifyWebhook: …`. Below, `<call>` stands for either one, where both can
  print the message. The conformance suite an adapter runs is the exception:
  its messages start with `describeWebhookQueues: …`, or with the case that
  failed.
- **A `TypeError` is a wiring mistake**: it comes from how the application was
  put together — an endpoint, a secret, a duration, an event rebuilt by hand —
  and never from a request. It is thrown when `webhooks()`, the listener it
  answers, or `verifyWebhook()` is called, so fix the configuration or the
  event passed in; no handler should answer one.
- **A delivery that fails is never thrown.** The listener waits for the
  insert into the queue only, and the flow of `@nxgt/janus` answers as usual;
  a delivery given up — out of retries, cut short by `close()`, or left to an
  endpoint no longer configured — goes to your `onGivingUp`, or is a
  `JANUS_WEBHOOK_GAVE_UP` process warning without one. With a `queue`, an
  insert that fails rejects the listener, and `janus` turns that into a
  `JANUS_EVENT_FAILED` warning; a queue failing after that is a
  `JANUS_WEBHOOK_QUEUE_FAILED` warning.
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
- [`webhooks: retries is a list of durations`](#webhooks-retries-is-a-list-of-durations)
- [`webhooks: retries wait at most 24 days each`](#webhooks-retries-wait-at-most-24-days-each)
- [`webhooks: an endpoint's id is 1 to 64 letters, digits, '.', '_' or '-'`](#webhooks-an-endpoints-id-is-1-to-64-letters-digits--_-or--)
- [`webhooks: two endpoints have one id — give each an id of its own; with a queue, two with the same url need one`](#webhooks-two-endpoints-have-one-id--give-each-an-id-of-its-own-with-a-queue-two-with-the-same-url-need-one)
- [`webhooks: queue is not a WebhookQueue — it has no <method>`](#webhooks-queue-is-not-a-webhookqueue--it-has-no-method)
- [`webhooks: concurrency is a whole number of requests, 1 or more`](#webhooks-concurrency-is-a-whole-number-of-requests-1-or-more)
- [`webhooks: poll and orphanGrace take effect with a queue only — pass one, or leave them out`](#webhooks-poll-and-orphangrace-take-effect-with-a-queue-only--pass-one-or-leave-them-out)
- [`webhooks: lease must be at least timeout plus 1s — a request that outlives its lease is sent twice`](#webhooks-lease-must-be-at-least-timeout-plus-1s--a-request-that-outlives-its-lease-is-sent-twice)
- [`webhooks: timeout is too long — the default lease, timeout plus 30s, waits at most 24 days`](#webhooks-timeout-is-too-long--the-default-lease-timeout-plus-30s-waits-at-most-24-days)
- [`webhooks: <lease or poll> waits at most 24 days`](#webhooks-lease-or-poll-waits-at-most-24-days)
- [`webhooks: the listener takes a user event — an id, one of user.created, user.emailVerified, user.passwordReset, user.deleted, a userId and a userType`](#webhooks-the-listener-takes-a-user-event--an-id-one-of-usercreated-useremailverified-userpasswordreset-userdeleted-a-userid-and-a-usertype)
- [`webhooks: an event's occurredAt is a valid Date`](#webhooks-an-events-occurredat-is-a-valid-date)
- [`verifyWebhook: pass the endpoint's secrets — at least one`](#verifywebhook-pass-the-endpoints-secrets--at-least-one)
- [`verifyWebhook: toleranceSeconds is a finite number of seconds, 0 or more`](#verifywebhook-toleranceseconds-is-a-finite-number-of-seconds-0-or-more)
- [`verifyWebhook: now is a valid Date`](#verifywebhook-now-is-a-valid-date)

**Types**
- [`TS2322: Type 'string | undefined' is not assignable to type 'string'.`](#ts2322-type-string--undefined-is-not-assignable-to-type-string)
- [`TS2322: Type 'string[]' is not assignable to type 'readonly [string, ...string[]]'.`](#ts2322-type-string-is-not-assignable-to-type-readonly-string-string)
- [`TS2322: Type '"endpointRemoved"' is not assignable to type 'never'.`](#ts2322-type-endpointremoved-is-not-assignable-to-type-never)
- [`TS18047: 'delivery.url' is possibly 'null'.`](#ts18047-deliveryurl-is-possibly-null)

**Delivering**
- [`[JANUS_WEBHOOK_GAVE_UP] Warning: webhooks: gave up <type> <event id> to <origin> after <n> attempts (<why>, <status or error>)`](#janus_webhook_gave_up-warning-webhooks-gave-up-type-event-id-to-origin-after-n-attempts-why-status-or-error)
- [`[JANUS_WEBHOOK_REPORT_FAILED] Warning: webhooks: onGivingUp failed on <type> <event id>: <name>`](#janus_webhook_report_failed-warning-webhooks-ongivingup-failed-on-type-event-id-name)
- [`[JANUS_WEBHOOK_QUEUE_FAILED] Warning: webhooks: the queue failed on <method>: <name> — deliveries wait in it until it answers again`](#janus_webhook_queue_failed-warning-webhooks-the-queue-failed-on-method-name--deliveries-wait-in-it-until-it-answers-again)
- [`[JANUS_WEBHOOK_QUEUE_FAILED] Warning: webhooks: the queue answered a delivery that cannot be sent (<name>) — counted as a failed attempt`](#janus_webhook_queue_failed-warning-webhooks-the-queue-answered-a-delivery-that-cannot-be-sent-name--counted-as-a-failed-attempt)
- [`[JANUS_EVENT_FAILED] Warning: janus: the events listener failed on <type> <event id> for user <user id>: <name>`](#janus_event_failed-warning-janus-the-events-listener-failed-on-type-event-id-for-user-user-id-name)
- [A redirect is counted as a failure](#a-redirect-is-counted-as-a-failure)
- [Events are lost when the process exits](#events-are-lost-when-the-process-exits)
- [Deliveries wait for an endpoint no longer configured](#deliveries-wait-for-an-endpoint-no-longer-configured)
- [An endpoint receives nothing, and nothing is given up](#an-endpoint-receives-nothing-and-nothing-is-given-up)

**Receiving**
- [`verifyWebhook` answers `null`](#verifywebhook-answers-null)
- [A webhook is received twice](#a-webhook-is-received-twice)
- [A webhook is received twice after a restart](#a-webhook-is-received-twice-after-a-restart)

**Testing a queue adapter**
- [`describeWebhookQueues: no test runner on globalThis — pass runner: { describe, it } (under bun test: import them from 'bun:test')`](#describewebhookqueues-no-test-runner-on-globalthis--pass-runner--describe-it--under-bun-test-import-them-from-buntest)
- [`the error is named StoreFailure but is not @nxgt/janus's StoreFailure: two copies of @nxgt/janus are installed. The adapter must list it as a peer dependency, never a dependency`](#the-error-is-named-storefailure-but-is-not-nxgtjanuss-storefailure-two-copies-of-nxgtjanus-are-installed-the-adapter-must-list-it-as-a-peer-dependency-never-a-dependency)
- [`expected a rejection, got <answer>`](#expected-a-rejection-got-answer)
- [`expected StoreFailure, got <error>`](#expected-storefailure-got-error)
- [`[JANUS_CONFORMANCE_SKIPPED] Warning: <case id> skipped: faults not provided: the outage invariant is not proven for this adapter`](#janus_conformance_skipped-warning-case-id-skipped-faults-not-provided-the-outage-invariant-is-not-proven-for-this-adapter)
- [`<name> — @nxgt/janus-webhooks queue conformance (WITHOUT faults: faults not provided: the outage invariant is not proven for this adapter)`](#name--nxgtjanus-webhooks-queue-conformance-without-faults-faults-not-provided-the-outage-invariant-is-not-proven-for-this-adapter)

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

The same with `webhooks: timeout:` for the request timeout,
`webhooks: lease:`, and — with a `queue` — `webhooks: poll:` and
`webhooks: orphanGrace:`.

**When:** calling `webhooks({ … })` with a `retries` entry, a `timeout`, a
`lease`, a `poll` or an `orphanGrace` written in a shape that is not a
duration: `'soon'`, `'5 min'`, `'1h30m'`, `'5S'`.
**Why:** a duration is a number of milliseconds, or one number followed by one
lowercase unit.
**Fix:**

```ts
webhooks({ endpoints, retries: ['30s', '5m', '1h'], timeout: '5s' });
webhooks({ endpoints, queue, lease: '1m', poll: '5s', orphanGrace: '48h' });
```

### `webhooks: retries: a duration in milliseconds must be a finite number above zero`

Also `webhooks: <timeout|lease|poll|orphanGrace>: a duration in milliseconds
must be a finite number above zero`, and `webhooks:
<retries|timeout|lease|poll|orphanGrace>: a duration must be above zero` for a
string such as `'0s'`.

**When:** calling `webhooks({ … })` with `0`, a negative number, `NaN` or
`Infinity` as a retry delay, the timeout, the `lease`, or a queue's `poll` or
`orphanGrace` — often `retries: [0]` meant as "retry at once", or
`timeout: 0` meant as "no timeout".
**Why:** each delay and the timeout must be above zero. There is no "no
timeout": a request that never answers would hold its delivery forever. The
same holds for the queue's durations: a lease of zero would hand a delivery
to every process at once, and a poll of zero would never let the queue rest.
**Fix:** a short delay for an immediate retry, and a real timeout; to send
once without any retry, pass an empty list:

```ts
webhooks({ endpoints, retries: [] });           // one attempt, no retry
webhooks({ endpoints, retries: ['1s', '1m'] }); // three attempts
```

### `webhooks: retries is a list of durations`

**When:** calling `webhooks({ retries: '5s' })` from JavaScript — one duration
where a list is expected.
**Why:** `retries` is the schedule: one delay per retry, in order.
**Fix:** a list, even of one:

```ts
webhooks({ endpoints, retries: ['5s'] }); // two attempts
```

### `webhooks: retries wait at most 24 days each`

**When:** calling `webhooks({ … })` with a retry delay longer than 2³¹ − 1 ms,
about 24.8 days — `'30d'`, `'720h'`.
**Why:** `setTimeout` cannot wait longer, so the timer for a retry is capped
there, and when it fires the retry is claimed as due: a retry meant for a
month later would be sent after 24.8 days.
**Fix:** a shorter delay. The cap holds with a `queue` too: the process that
fails an attempt sets a timer for its retry. More attempts, spaced out, reach
as far:

```ts
webhooks({ endpoints, retries: ['1h', '1d', '7d', '14d', '21d'] });
```

### `webhooks: an endpoint's id is 1 to 64 letters, digits, '.', '_' or '-'`

**When:** calling `webhooks({ … })` with an endpoint whose `id` is not a
string, is empty, is longer than 64 characters, or holds any other
character — a URL, a space, a slash.
**Why:** the id is what a queue stores, and what a `JANUS_WEBHOOK_GAVE_UP`
warning names for an endpoint no longer configured. Keeping it to a plain
name keeps a URL — and the token its query may hold — out of both.
**Fix:** a short name that says which endpoint it is:

```ts
webhooks({ endpoints: [{ id: 'crm', url: 'https://crm.example.com/hooks/janus', secrets: [secret] }], queue });
```

### `webhooks: two endpoints have one id — give each an id of its own; with a queue, two with the same url need one`

**When:** calling `webhooks({ … })` with two endpoints whose `id`s are the
same — or, with a `queue`, two with the same URL and no `id`, since each then
takes the hash of its URL.
**Why:** a queue holds one delivery per event and endpoint id: two endpoints
under one id would share one delivery, and one of them would never receive
the event.
**Fix:** give each its own `id`. Two entries for one URL — a receiver taking
two sets of types with different secrets — need one each:

```ts
webhooks({
	endpoints: [
		{ id: 'crm-users', url, secrets: [crmSecret], types: ['user.created'] },
		{ id: 'crm-deletions', url, secrets: [otherSecret], types: ['user.deleted'] },
	],
	queue,
});
```

Without a `queue`, two endpoints with the same URL and no `id` stay legal,
as in 0.1.0: each is named by its position. So does an `id` written that
equals another endpoint's position — `[{ url: a, id: '1' }, { url: b }]` —
since without a queue each is sent under its position; only two `id`s
written alike are refused.

### `webhooks: queue is not a WebhookQueue — it has no <method>`

**When:** calling `webhooks({ queue })` from JavaScript, or through a cast,
with an object missing one of the six methods — `insertDeliveries`,
`claimDeliveries`, `claimOrphanedDeliveries`, `extendLease`,
`scheduleRetry`, `deleteDelivery`. TypeScript refuses it at compile time.
**Why:** a queue without, say, `scheduleRetry` would lose every delivery at
its first failure; it is refused before any event is taken.
**Fix:** pass the adapter's queue as it is, not a spread or a wrapper that
drops methods — and run [the conformance suite](guide/queues.md#testing-an-adapter)
against your own:

```ts
webhooks({ endpoints, queue: createMyWebhookQueue(db) });
```

### `webhooks: concurrency is a whole number of requests, 1 or more`

**When:** calling `webhooks({ concurrency })` with a string — often read from
the environment — `0`, a negative number or a fraction.
**Why:** it is how many requests one process sends at once.
**Fix:** parse it, and leave it out for the default of 64:

```ts
webhooks({ endpoints, concurrency: Number(process.env.WEBHOOK_CONCURRENCY ?? 64) });
```

### `webhooks: poll and orphanGrace take effect with a queue only — pass one, or leave them out`

**When:** calling `webhooks({ poll })` or `webhooks({ orphanGrace })` without
a `queue`.
**Why:** both are about deliveries other processes left in a shared queue.
Without one, deliveries wait in this process's memory, where no other
process leaves any: the options would do nothing, silently.
**Fix:** pass the `queue` they are for, or remove them:

```ts
webhooks({ endpoints, queue, poll: '5s', orphanGrace: '48h' });
```

### `webhooks: lease must be at least timeout plus 1s — a request that outlives its lease is sent twice`

**When:** calling `webhooks({ lease, timeout })` with a `lease` shorter than
`timeout` plus one second — often `timeout` raised without `lease`.
**Why:** a claimed delivery is hidden for `lease`. A request that could run
longer would be claimed and sent again by another process while it is still
running. The second past `timeout` is what the worker needs to extend the
lease before it reports a failure: without it, a slow `onGivingUp` let
another claim take the delivery, and send and report it again.
**Fix:** leave `lease` out — it defaults to `timeout` plus 30 seconds — or
keep a margin of seconds, not milliseconds:

```ts
webhooks({ endpoints, queue, timeout: '30s', lease: '1m' });
```

### `webhooks: timeout is too long — the default lease, timeout plus 30s, waits at most 24 days`

**When:** calling `webhooks({ timeout })`, with or without a `queue`, with no `lease` and a
`timeout` within 30 seconds of 2³¹ − 1 ms, about 24.8 days.
**Why:** the default lease is `timeout` plus 30 seconds, and a lease is
waited on by `setTimeout`, which fires at once past 2³¹ − 1 ms. The message
names `timeout` because no `lease` was passed.
**Fix:** a request is seconds; a `timeout` of days is almost certainly a
unit written wrong — `'30s'`, not `30` days:

```ts
webhooks({ endpoints, queue, timeout: '30s' });
```

### `webhooks: <lease or poll> waits at most 24 days`

**When:** calling `webhooks({ … })` with a `lease` or a `poll` longer than
2³¹ − 1 ms, about 24.8 days.
**Why:** both are waited on by `setTimeout`, which fires at once past that.
**Fix:** a shorter one: a poll is seconds, a lease a little more than a
request can take.

### `webhooks: the listener takes a user event — an id, one of user.created, user.emailVerified, user.passwordReset, user.deleted, a userId and a userType`

**When:** calling the listener yourself, from JavaScript or through a cast,
with something that is not a user event — a type `janus` never sends
(`'user.signedIn'`), or an event without its `id`, `userId` or `userType`.
`janus` itself never hands one over, and TypeScript refuses one.
**Why:** every receiver's `verifyWebhook` would answer `null` for it, so the
delivery could only fail on every retry. It is refused at once instead:
nothing is sent, retried or given up.
**Fix:** hand the listener only the events `janus({ events })` gives it, or
rebuild one whole — see the next entry for its `occurredAt`.

### `webhooks: an event's occurredAt is a valid Date`

**When:** calling the listener yourself with an event rebuilt by hand — from
a `JANUS_EVENT_FAILED` warning, say — whose `occurredAt` is an Invalid Date or
not a `Date` at all. `janus` itself never hands one over.
**Why:** the body carries `occurredAt` as an ISO timestamp; without one there
is nothing to sign. It is refused at once, as the caller's mistake: nothing is
sent, nothing is retried, nothing is given up.
**Fix:** rebuild the event with a real date — the user's `updatedAt` is the
nearest you have:

```ts
const user = await auth.get(userId);
listener({ id, type: 'user.created', occurredAt: user.updatedAt, userId, userType: user.type });
```

### `verifyWebhook: pass the endpoint's secrets — at least one`

**When:** calling `verifyWebhook({ secrets: [], … })`.
**Why:** with no secret, no request can be verified; answering `null` to every
one would look like a forgery attack instead of a configuration mistake.
**Fix:** pass the endpoint's secrets — the same ones the sender lists for
this endpoint, and during a rotation both:

```ts
const [first, ...rest] = [process.env.WEBHOOK_SECRET, process.env.WEBHOOK_SECRET_NEXT].filter(
  (secret): secret is string => secret !== undefined,
);
if (first === undefined) throw new Error('WEBHOOK_SECRET is not set');

verifyWebhook({ secrets: [first, ...rest], headers, body });
```

Leaving `secrets` out entirely is refused with the same message.

### `verifyWebhook: toleranceSeconds is a finite number of seconds, 0 or more`

**When:** calling `verifyWebhook({ toleranceSeconds, … })` with `NaN`, a
negative number or `Infinity` — most often `Number(process.env.TOLERANCE)`
with the variable unset.
**Why:** the tolerance is what stops a replay. Compared with `NaN` or
`Infinity`, every timestamp would pass, so a request recorded years ago would
verify; a negative one would refuse every request.
**Fix:** leave it out for the default `300`, or check the number you read:

```ts
const toleranceSeconds = Number(process.env.WEBHOOK_TOLERANCE ?? 300);
if (!Number.isFinite(toleranceSeconds)) throw new Error('WEBHOOK_TOLERANCE is not a number');
```

### `verifyWebhook: now is a valid Date`

**When:** calling `verifyWebhook({ now, … })` with an Invalid Date —
`new Date(undefined)`, `new Date('not a date')` — or with something that is
not a `Date`, such as a number of milliseconds.
**Why:** the same as the tolerance: against an Invalid Date, every timestamp
would pass.
**Fix:** leave `now` out outside tests; in a test, pass a real date:

```ts
verifyWebhook({ secrets, headers, body, now: new Date('2026-09-26T12:00:00Z') });
```

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

### `TS2322: Type '"endpointRemoved"' is not assignable to type 'never'.`

**When:** `tsc`, after upgrading to 0.2, on a `switch` over `reason.why` that
handles `'retriesRanOut'` and `'closed'` and checks the rest is `never`.
**Why:** 0.2 added a third reason: a delivery waiting, with a `queue`, for
an endpoint no process is configured with any more.
**Fix:** handle it — the event is in `delivery.event`, and there is no URL:

```ts
switch (reason.why) {
	case 'retriesRanOut':
	case 'closed':
		return deadLetters.insert({ event: delivery.event, endpoint: delivery.endpoint, ...reason });
	case 'endpointRemoved':
		return logger.warn({ eventId: delivery.event.id, endpoint: delivery.endpoint }, 'endpoint removed');
	default: {
		const exhausted: never = reason.why;
		return exhausted;
	}
}
```

### `TS18047: 'delivery.url' is possibly 'null'.`

Or `TS2345: Argument of type 'string | null' is not assignable to parameter
of type 'string | URL'.`, on `new URL(delivery.url)`.

**When:** `tsc`, after upgrading to 0.2, on code in `onGivingUp` that reads
`delivery.url` as a string.
**Why:** a queue holds the endpoint's id, never its URL. A delivery given up
as `endpointRemoved` belongs to an endpoint no longer configured, so its URL
is unknown: `null`.
**Fix:** name the endpoint by `delivery.endpoint`, always present, and read
the URL only when there is one:

```ts
const origin = delivery.url === null ? null : new URL(delivery.url).origin;
```

## Delivering

### `[JANUS_WEBHOOK_GAVE_UP] Warning: webhooks: gave up <type> <event id> to <origin> after <n> attempts (<why>, <status or error>)`

One attempt is written in the singular — `after 1 attempt (retriesRanOut, 503)` — which is what `retries: []` gives for any delivery that was sent.

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
| `(closed, 503)`, `(closed, TimeoutError)` | without a `queue`: `close()` was called while the delivery waited for a retry, or while an attempt was in flight that then failed with a retry left: the last attempt's status or failure |
| `after 0 attempts (closed, no answer)` | without a `queue`: the event arrived after `close()`: nothing was sent |
| `to endpoint <id> … (endpointRemoved, …)` | with a `queue`: the delivery waited longer than `orphanGrace` for an endpoint id no process is configured with — see [Deliveries wait for an endpoint no longer configured](#deliveries-wait-for-an-endpoint-no-longer-configured). It names the id, the only thing the queue knows of the endpoint |

With the default schedule, a delivery is retried for more than a day
(`5s`, `5m`, `30m`, `2h`, `5h`, `10h`, `10h`, eight attempts), so this warning
comes about 27 hours after the event.
**Why:** the endpoint was down, failing, too slow, redirecting, or
unreachable for all that time. The event is not sent again.
**Fix:** pass `onGivingUp` and keep what it is given, so the event can be sent
again once the endpoint is back — `delivery.event` is the whole event:

```ts
const listener = webhooks({
  endpoints,
  onGivingUp: async (delivery, reason) => {
    await deadLetters.insert({ event: delivery.event, endpoint: delivery.endpoint, ...reason });
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
    await deadLetters.insert({ event: delivery.event, endpoint: delivery.endpoint, ...reason });
  } catch {
    logger.error({ event: delivery.event, reason }, 'webhook given up, and not stored');
  }
},
```

The warning holds the event's type and `id`, not the user's id: to find what
was lost, reconcile the receiver's copy against the users themselves, as in
`@nxgt/janus`'s
[An event you expected never arrived](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md#an-event-you-expected-never-arrived).

### `[JANUS_WEBHOOK_QUEUE_FAILED] Warning: webhooks: the queue failed on <method>: <name> — deliveries wait in it until it answers again`

**When:** with a `queue`, a call to it threw — `claimDeliveries` on a poll,
`scheduleRetry` or `deleteDelivery` after a request, `extendLease` while
`onGivingUp` ran. `<name>` is the failure's name, `StoreFailure` from a
well-behaved adapter; never its message, which may hold a connection string.
A `TypeError` on `claimDeliveries` or `claimOrphanedDeliveries` may be this
package's own check: the adapter answered a claim with something other than
a list — `null`, `undefined`, a cursor — and the claim is refused with
`the queue answered a claim with no list`. The queue is then not down but
wrong; run [the conformance suite](guide/queues.md#testing-an-adapter)
against it.
**Why:** the queue is down or unreachable. The warning is written **once
per outage**: the next call that succeeds ends it, and the next failure
warns again. Meanwhile the pump backs off, doubling from `poll` up to 30
seconds. Nothing is lost: deliveries wait in the queue, and a request whose
retry or delete could not be written is sent again once its lease lapses —
a receiver may see it twice.
**Fix:** bring the queue back; nothing needs restarting. Watch for the
warning where you watch the process's health:

```ts
process.on('warning', (warning) => {
  if ((warning as { code?: string }).code === 'JANUS_WEBHOOK_QUEUE_FAILED') alert(warning.message);
});
```

For the `TypeError` of a claim, nothing comes back by itself: fix the
adapter, so a claim answers a list — `[]` when nothing is due — and throws
when the queue cannot answer.

### `[JANUS_WEBHOOK_QUEUE_FAILED] Warning: webhooks: the queue answered a delivery that cannot be sent (<name>) — counted as a failed attempt`

**When:** with a `queue`, a claim answered a delivery whose event cannot be
written as a body — an `occurredAt` that is not a valid `Date`
(`RangeError`). Written once per such attempt.
**Why:** the adapter stored or read the event wrongly. The attempt is
counted as failed, with no request sent and `<name>` as its error, so the
delivery follows the retry schedule and is given up as `retriesRanOut` when
it runs out — instead of being claimed and failing for ever. A rarer
variant, `webhooks: the queue answered a delivery that cannot be handled
(<name>)`, is a delivery broken past even that; its lease lapses and it is
claimed again.
**Fix:** run [the conformance suite](guide/queues.md#testing-an-adapter)
against the adapter — `queue.roundTrip` and `queue.everyType` fail one that
does not answer the event as it was written. The deliveries given up are in
`onGivingUp`, with `reason.error` the `<name>` above.

### `[JANUS_EVENT_FAILED] Warning: janus: the events listener failed on <type> <event id> for user <user id>: <name>`

`@nxgt/janus`'s warning, not this package's: its
[entry](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md#janus_event_failed-warning-janus-the-events-listener-failed-on-type-event-id-for-user-user-id-name)
has the general case. `<name>` is the failure's name — or its `typeof` when
what was thrown is not an `Error` — never its message. From this package it
is usually `StoreFailure`, what a well-behaved queue adapter throws when it
is down.

**When:** with a `queue`, a flow wrote a user and the listener could not
insert the event's deliveries: the queue was down. The flow still answered
as usual.
**Why:** every delivery goes through the queue, and the insert is the one
step with nowhere else to go: no request was sent, and nothing will send it.
It is the one place an event can be lost, and it is reported with the
event's type and id and the user's id.
**Fix:** once the queue is back, send the event again with the same id, so a
receiver that somehow had it ignores it. The warning holds what it takes to
rebuild it; `occurredAt` is the user's `createdAt` or `updatedAt`:

```ts
await listener({ id: eventId, type: 'user.created', occurredAt: user.createdAt, userId: user.id, userType: user.type });
```

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

**When:** without a `queue`, after a deploy, a restart or a crash, an
endpoint that was down for a moment never receives some events — and no
`JANUS_WEBHOOK_GAVE_UP` warning or `onGivingUp` call says so.
**Why:** without a `queue`, deliveries wait **in this process's memory**, on
timers that do not hold the process open. A process that exits without
calling `close()` drops them with no trace. `close()` sends every delivery
due when it is called, waits for the requests in flight, and gives up each
retry still waiting as `closed`, so it reaches `onGivingUp`. A crash (`SIGKILL`, out of memory) runs nothing at all.
**Fix:** pass a `queue` every process shares, and what one process leaves
waiting — a retry, a request a crash cut short — the next one sends. On
Redis, that queue is
[`@nxgt/janus-webhooks-redis`](https://www.npmjs.com/package/@nxgt/janus-webhooks-redis);
for another database, see [queues](guide/queues.md):

```ts
import { createRedisWebhookQueue } from '@nxgt/janus-webhooks-redis';
import { connectRedis } from '@nxgt/redis';

const redis = await connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  enableOfflineQueue: false, // an outage fails the insert at once, not after 31 s
});
const queue = createRedisWebhookQueue(redis); // the same Redis and prefix in every process

const listener = webhooks({ endpoints, queue, onGivingUp }); // give each endpoint an id
const auth = janus({ ...options, events: listener });

process.on('SIGTERM', async () => {
  server.stop(); // no new event
  await listener.close(); // the requests in flight; nothing is given up
  process.exit(0);
});
```

Without a queue, stop taking requests first, then `close()`, so what waits
is at least reported. On a platform that freezes the process as soon as a
response is sent, a queue keeps the event even when the first request never
leaves: the listener awaits the insert before the flow answers, and another
process — or the next invocation — sends it.

### Deliveries wait for an endpoint no longer configured

**When:** with a `queue`, after an endpoint was removed from `endpoints`, or
its URL changed while it had no `id`, deliveries are given up a day later
as `endpointRemoved` — `delivery.url` is `null`, and the warning reads
`to endpoint <id>`.
**Why:** a queue holds each delivery by the endpoint's **id**. Without an
`id`, that is a hash of the URL: a new URL is a new id, and what waited for
the old one belongs to no endpoint. Each process gives such a delivery up
once it has been due for `orphanGrace` (`'24h'`) — long enough that a
rolling deploy, some processes on the old configuration and some on the new,
never gives up the other version's deliveries.
**Fix:** give each endpoint an `id`, so its URL can change and its
deliveries follow:

```ts
webhooks({ endpoints: [{ id: 'crm', url: 'https://crm.example.com/hooks/v2', secrets: [secret] }], queue });
```

For the deliveries already given up, `onGivingUp` has each event: send it
again to the endpoint as it is now configured. A removed endpoint's
deliveries are meant to go: shorten `orphanGrace` to see them go sooner.

### An endpoint receives nothing, and nothing is given up

**When:** events happen, the endpoint sees no request, and there is no
`JANUS_WEBHOOK_GAVE_UP` warning.
**Why:** one of these:
- the endpoint's `types` does not name the event's type — `types: []` names
  none, and the endpoint receives nothing at all;
- `janus()` was given another listener than the one `webhooks()` answered, or
  none — each `janus()` instance takes its own `events`;
- the process exited while a retry waited, without a `queue` — see
  [Events are lost when the process exits](#events-are-lost-when-the-process-exits);
- with a `queue`, the queue is down — see
  [`JANUS_WEBHOOK_QUEUE_FAILED`](#janus_webhook_queue_failed-warning-webhooks-the-queue-failed-on-method-name--deliveries-wait-in-it-until-it-answers-again) —
  or the endpoint's id changed, so what waits is not its any more — see
  [Deliveries wait for an endpoint no longer configured](#deliveries-wait-for-an-endpoint-no-longer-configured);
- the flow wrote nothing, so no event was sent — see `@nxgt/janus`'s
  [An event you expected never arrived](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md#an-event-you-expected-never-arrived).

**Fix:** leave `types` out to receive every type, and hand the same
`webhooks()` to every `janus()` that should send:

```ts
const listener = webhooks({ endpoints: [{ url, secrets: [secret] }] });
const auth = janus({ ...options, events: listener });
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
  as [the sending guide](guide/sending.md) says: sign with both, let the
  receiver accept both, drop the old one from the sender, and last from the
  receiver;
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
`req.body.toString('utf8')`; `req.headers` goes as it is — a header record is
read whatever the case of its keys. Check the clocks (NTP) before raising
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

### A webhook is received twice after a restart

**When:** with a `queue`, a receiver gets the same `webhook-id` twice around a
deploy, a crash or a queue outage — sometimes seconds apart, after a request
it had already answered `2xx`.
**Why:** delivery is at least once, across processes too. A delivery is
claimed under a lease; a process that dies mid-request — or answers `2xx` but
cannot delete the delivery because the queue is down — leaves it in the
queue, and once the lease lapses (`timeout` plus 30 seconds) another process
sends it again. A lease that lapses while a request still runs, because the
processes' clocks disagree by more than the margin, does the same. The same
holds for reports: `onGivingUp` may be called twice for one delivery when a
process dies between reporting and removing it.
**Fix:** nothing on the sender: deduplicate on the receiver, by `webhook-id`,
exactly as for a retry — see [A webhook is received twice](#a-webhook-is-received-twice).
Keep the processes' clocks on NTP, and key a dead-letter table on
`delivery.event.id` and `delivery.endpoint` so a second report is a no-op.

## Testing a queue adapter

These come from `@nxgt/janus-webhooks/conformance`, run by the author of a
`WebhookQueue` adapter — see [testing an adapter](guide/queues.md#testing-an-adapter).

### `describeWebhookQueues: no test runner on globalThis — pass runner: { describe, it } (under bun test: import them from 'bun:test')`

**When:** loading a test file that calls `describeWebhookQueues({ … })`
without `runner`, under `bun test` — or under vitest without
`globals: true`.
**Why:** without `runner`, the suite reads `describe` and `it` from
`globalThis`, as jest and vitest with `globals: true` put them. `bun test`
gives a test file `describe` and `it` as bare names, not as properties of
`globalThis`, so there is nothing to read.
**Fix:** import them and pass them:

```ts
import { describe, it } from 'bun:test';
import { describeWebhookQueues } from '@nxgt/janus-webhooks/conformance';

describeWebhookQueues({ name: 'my queue', harness, runner: { describe, it } });
```

### `the error is named StoreFailure but is not @nxgt/janus's StoreFailure: two copies of @nxgt/janus are installed. The adapter must list it as a peer dependency, never a dependency`

The second line of a failure whose first names the case: `<method> under an
outage`.

**When:** an `outage.<method>` case, once `faults` made the method fail: the
adapter threw an error named `StoreFailure`, but not an instance of the
`StoreFailure` class the suite imports from `@nxgt/janus`.
**Why:** two copies of `@nxgt/janus` are installed — almost always because
the adapter lists it under `dependencies`, so it gets a copy of its own. Its
`StoreFailure` is another class, and an application's
`error instanceof StoreFailure` would be `false` for every outage, exactly as
here.
**Fix:** make `@nxgt/janus` a peer of the adapter, and install it once, at
the application:

```json
{
  "peerDependencies": {
    "@nxgt/janus": "^0.8.0",
    "@nxgt/janus-webhooks": "^0.2.0"
  }
}
```

Then check that one copy is left: `bun pm ls --all | grep @nxgt/janus@`.

### `expected a rejection, got <answer>`

The second line of a failure whose first names the case: `<method> under an
outage should reject`, with `<answer>` the `[]`, `false` or `0` the method
returned.

**When:** an `outage.<method>` case, once `faults` made the method fail: the
adapter answered instead of throwing.
**Why:** a `catch` that answers an absence — `catch { return [] }` — turns an
outage into "nothing is due": the worker waits, and deliveries sit unsent
with nothing reported. The port's rule is that a failure throws.
**Fix:** let the failure through, as a `StoreFailure` with the driver's error
as `cause`:

```ts
try {
	return await claim(now, until, limit);
} catch (cause) {
	throw new StoreFailure('webhookQueue.claimDeliveries: the queue could not answer', {
		operation: 'claimDeliveries',
		cause,
	});
}
```

### `expected StoreFailure, got <error>`

The second line of a failure whose first names the case: `<method> under an
outage`.

**When:** an `outage.<method>` case: the adapter rejected, but with the
driver's own error, or another class.
**Why:** an application tells an outage apart with
`error instanceof StoreFailure`; a driver's error slips past it.
**Fix:** wrap the driver's error, as in the entry above.

### `[JANUS_CONFORMANCE_SKIPPED] Warning: <case id> skipped: faults not provided: the outage invariant is not proven for this adapter`

A process warning, not a failure: the case is counted as passed.

**When:** running the suite without `faults: false`, and a harness whose
`open()` answers no `faults` — once for each case that needs them: every
`outage.<method>` case, and `queue.rejectedInsertLeavesNothing`.
**Why:** the outage cases prove that a method rejects, and never answers
`[]`, `false` or `0`, when the queue cannot answer. Without a way to make
the database fail, that is not proven — and a skip is always reported, never
passed over in silence.
**Fix:** answer `faults` from the harness, failing the method the way the
database fails — a cut connection, a revoked permission — not a wrapper that
throws in front of the adapter:

```ts
harness: {
	async open() {
		const db = await openEmptyDatabase();
		return {
			queue: createMyWebhookQueue(db),
			// Every call to that method fails from now on, until the case closes.
			faults: { fail: async (method) => db.failEvery(method) },
			close: () => db.drop(),
		};
	},
},
```

When the adapter's store cannot be made to fail, say so up front with
`faults: false`: see the next entry.

### `<name> — @nxgt/janus-webhooks queue conformance (WITHOUT faults: faults not provided: the outage invariant is not proven for this adapter)`

The title of the suite in the test report, with each case that needs
`faults` — every `outage.<method>`, and `queue.rejectedInsertLeavesNothing` —
listed as skipped: `<case> — skipped: faults not provided: …`.

**When:** calling `describeWebhookQueues({ …, faults: false })`.
**Why:** `faults: false` declares that the harness cannot make a method fail.
The suite then skips the outage cases, and says so in its title, so the
report never reads as a full pass: the adapter is not proven to throw when
its store is down.
**Fix:** nothing, if that is the truth about the adapter. To prove it, give
the harness `faults`, as in the entry above, and drop `faults: false`:

```ts
describeWebhookQueues({ name: 'my queue', harness, runner: { describe, it } });
```
