# @nxgt/janus-webhooks — documentation

The [README](../README.md) shows both sides in one example each; these pages
give the detail.

| Page | Read it when |
| --- | --- |
| [Sending webhooks](guide/sending.md) | You are wiring `webhooks()` into `janus({ events })`: endpoints, the retry schedule, giving up, shutdown, the wire format, rotating a secret, a test |
| [Receiving webhooks](guide/receiving.md) | You are writing the endpoint: `verifyWebhook`, the raw body, what to answer, handling each event once, a test |
| [Queues](guide/queues.md) | Deliveries must survive a restart: the `queue` option, leases, orphans, the `WebhookQueue` port, and writing and testing an adapter |
| [Troubleshooting](troubleshooting.md) | A `TypeError` at wiring, a `JANUS_WEBHOOK_*` warning, or a receiver that answers `null` for requests you sent |
| [Roadmap](roadmap.md) | You want to know what is coming, what shipped, and what is deliberately not planned |

## Words

The words **user event** and **listener** are
[`@nxgt/janus`'s vocabulary](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/vocabulary.md),
and mean the same here. These pages add:

| Word | Means | Not |
| --- | --- | --- |
| **endpoint** | A URL that receives user events, with the secrets its requests are signed with and the types it takes: a `WebhookEndpoint` | "target", "subscriber" |
| **receiver** | The service behind an endpoint, which calls `verifyWebhook` | "consumer" |
| **delivery** | One user event on its way to one endpoint: a `Delivery`. One event sent to two endpoints is two deliveries, each retried and given up on its own | "message", "job" |
| **attempt** | One request of a delivery. `Delivery.attempts` counts them. Not `@nxgt/janus`'s attempt — a code tried against a challenge | "try" |
| **retry** | An attempt after a failed one, sent on the schedule of `retries`. Not `@nxgt/janus`'s retry — a write repeated after a conflict | "redelivery" |
| **give up** | End a delivery without a `2xx`: every attempt failed (`retriesRanOut`), `close()` came first (`closed`), or its endpoint is no longer configured (`endpointRemoved`). Reported to `onGivingUp`, or as a `JANUS_WEBHOOK_GAVE_UP` warning | "drop", "fail", "dead" |
| **queue** | Where deliveries wait between the event and their last attempt: a `WebhookQueue`. The one passed as `queue` is shared by processes and outlives them; without it, one in the process's memory | "store", "buffer", "outbox" |
| **claim** | Take due deliveries from the queue to send them: each claim counts an attempt and holds a lease | "pop", "dequeue", "lock" |
| **lease** | How long a claim hides a delivery from every other claim, and the token that proves it: every write after the claim names it. A lease that lapses makes the delivery due again | "lock", "visibility timeout" |
| **endpoint id** | What a queue knows an endpoint by — never its URL: the endpoint's `id`, or a hash of its URL with a `queue`, its position without one. `Delivery.endpoint` | "endpoint key", "target id" |
| **orphan** | A delivery waiting for an endpoint id no configuration has any more; given up as `endpointRemoved` after `orphanGrace` | "stale delivery", "dead letter" |
| **secret** | A `whsec_…` string, shared by the sender and the receiver of one endpoint: `mintWebhookSecret()` makes one | "key", "token" |
