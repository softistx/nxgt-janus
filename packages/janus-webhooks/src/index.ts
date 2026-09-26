/**
 * `@nxgt/janus-webhooks` — `@nxgt/janus` user events, delivered as signed
 * webhooks.
 *
 * - `webhooks({ endpoints })` — the listener `janus({ events })` takes: it
 *   signs each event by the Standard Webhooks specification and posts it,
 *   retrying on failure, and reports each delivery it gives up;
 * - `verifyWebhook({ secrets, headers, body })` — the receiving side: the
 *   event a request carries, or `null` when it is not one the secrets signed;
 * - `mintWebhookSecret()` — a new `whsec_` secret for an endpoint.
 */

export {
	type Delivery,
	type Failure,
	type GivingUp,
	type WebhookEndpoint,
	type Webhooks,
	type WebhooksOptions,
	webhooks,
} from './deliver';
export {
	type HeadersLike,
	type VerifyOptions,
	verifyWebhook,
	type WebhookBody,
} from './payload';
export { mintWebhookSecret } from './signature';
