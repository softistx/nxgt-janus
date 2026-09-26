# @nxgt/janus-webhooks

## 0.1.0

### Minor Changes

- [#72](https://github.com/softistx/nxgt-janus/pull/72) [`14fd30c`](https://github.com/softistx/nxgt-janus/commit/14fd30cde0a96dd93c1a199418196443ccde24df) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: `@nxgt/janus` user events, delivered as signed Standard Webhooks.
  
  - `webhooks({ endpoints, retries?, timeout?, onGivingUp?, fetch? })` is the listener `janus({ events })` takes. It signs each event with every secret of the endpoint (`whsec_`, HMAC-SHA256; the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers), posts it without holding the flow, and retries a failure on the specification's schedule. Only a `2xx` succeeds; a redirect is not followed.
  - A delivery given up — out of retries, or cut short by `close()` — goes to `onGivingUp`, or is a `JANUS_WEBHOOK_GAVE_UP` warning naming the endpoint's origin only. `close()` waits for the requests in flight. Retries wait in memory; a durable queue is next.
  - `verifyWebhook({ secrets, headers, body })` answers the event a request carries, or `null` for anything the secrets did not sign, outside the tolerance, or not a user event. `mintWebhookSecret()` makes a secret.

### Patch Changes

- Updated dependencies [[`14fd30c`](https://github.com/softistx/nxgt-janus/commit/14fd30cde0a96dd93c1a199418196443ccde24df)]:
  - @nxgt/janus@0.8.2
