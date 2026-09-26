# Roadmap

Where `@nxgt/janus-webhooks` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

- **The first release** — `webhooks({ endpoints })`, the listener
  `janus({ events })` takes: each `@nxgt/janus` user event signed by the
  Standard Webhooks specification (HMAC-SHA256, `webhook-id`,
  `webhook-timestamp` and `webhook-signature` headers) and posted to your
  endpoints, retried with backoff in memory when a request fails. Secrets
  rotate by listing the new one beside the old, and `mintWebhookSecret()`
  makes a new `whsec_` secret. A delivery whose retries run out goes to your
  `onGivingUp`, or is a `JANUS_WEBHOOK_GAVE_UP` warning without one — never
  dropped in silence. On the receiving side, `verifyWebhook` answers the
  event a request carries, or `null` when it is not one your secrets signed.
  Not yet on npm; it will be once reviewed.

## Next

- **A durable queue for retries** — a pluggable queue for deliveries waiting
  on a retry, so they survive a restart instead of living in memory; a
  Redis-backed one first.

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

Newest first; the [CHANGELOG](../CHANGELOG.md) holds every release.

Nothing yet.
