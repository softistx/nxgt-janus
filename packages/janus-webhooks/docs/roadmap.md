# Roadmap

Where `@nxgt/janus-webhooks` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

- **A durable queue for deliveries** — every delivery goes through a
  `WebhookQueue`, and one passed as `webhooks({ queue })` outlives the
  process: a retry failed by one process is sent by the next, and a request
  cut short by a crash is sent again once its lease lapses. The port, its
  memory reference `createMemoryWebhookQueue()` and the conformance suite
  `@nxgt/janus-webhooks/conformance` are in this release; a Redis-backed
  adapter, `@nxgt/janus-webhooks-redis`, is the other half, in progress.

## Next

Nothing queued.

## Later

- **Limits per endpoint** — a cap on concurrent requests and a rate limit
  for each endpoint, so a burst of events does not flood a receiver.
- **Replaying what gave up** — a helper that sends again the deliveries
  handed to `onGivingUp`, once the endpoint is back.

## Not planned

- **Event types beyond those `@nxgt/janus` sends** — the package delivers
  the user events it is handed; it does not invent events of its own. A new
  event belongs in `@nxgt/janus`, and is delivered here once it exists.
- **Following redirects** — a request succeeds on a `2xx` and nothing else;
  a redirect counts as a failure and is retried at the same URL. Point the
  endpoint at its final address.

## Shipped

Newest first; from the first release on, the package's CHANGELOG holds every one.

- **The first release, v0.1.0** — `webhooks({ endpoints })`, the listener
  `janus({ events })` takes: each `@nxgt/janus` user event signed by the
  Standard Webhooks specification (HMAC-SHA256, `webhook-id`,
  `webhook-timestamp` and `webhook-signature` headers) and posted to your
  endpoints, retried with backoff in memory when a request fails. Secrets
  rotate by listing the new one beside the old, and `mintWebhookSecret()`
  makes a new `whsec_` secret. A delivery given up — out of retries, or cut
  short by `close()` — goes to your `onGivingUp`, or is a `JANUS_WEBHOOK_GAVE_UP` warning without one — never
  dropped in silence. On the receiving side, `verifyWebhook` answers the
  event a request carries, or `null` when it is not one your secrets signed.
