# @nxgt/janus-webhooks — documentation

The [README](../README.md) shows both sides in one example each; these pages
give the detail.

| Page | Read it when |
| --- | --- |
| [Sending webhooks](guide/sending.md) | You are wiring `webhooks()` into `janus({ events })`: endpoints, the retry schedule, giving up, shutdown, the wire format, rotating a secret, a test |
| [Receiving webhooks](guide/receiving.md) | You are writing the endpoint: `verifyWebhook`, the raw body, what to answer, handling each event once, a test |
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
| **give up** | End a delivery without a `2xx`: every attempt failed (`retriesRanOut`), or `close()` came first (`closed`). Reported to `onGivingUp`, or as a `JANUS_WEBHOOK_GAVE_UP` warning | "drop", "fail", "dead" |
| **secret** | A `whsec_…` string, shared by the sender and the receiver of one endpoint: `mintWebhookSecret()` makes one | "key", "token" |
