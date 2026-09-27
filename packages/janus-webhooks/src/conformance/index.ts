/**
 * `@nxgt/janus-webhooks/conformance` — **what makes the queue port's contract
 * checkable.**
 *
 * The author of a queue adapter runs this against their `WebhookQueue`, and
 * it fails one that breaks a rule of the port — above all *an absence is
 * `[]` or `false`, a failure throws*, and *two claims never answer one
 * delivery*. The same three layers as `@nxgt/janus/conformance`, and the
 * lowest depends on no test runner:
 *
 * - the cases, as data — `webhookQueueCases`, `webhookQueueOutageCases`,
 *   `allWebhookQueueCases`;
 * - `runWebhookQueueCase`, which runs one against a harness;
 * - `describeWebhookQueues`, which describes them all under bun:test, vitest
 *   or jest.
 *
 * It imports no test framework and no assertion library.
 */

export { webhookQueueOutageCases } from './cases/outage';
export {
	allWebhookQueueCases,
	describeWebhookQueues,
	runWebhookQueueCase,
	SKIP_REASONS,
	webhookQueueCases,
} from './describe';
export { referenceWebhookQueueHarness } from './reference';
export type {
	OpenedWebhookQueue,
	WebhookQueueCase,
	WebhookQueueContext,
	WebhookQueueFaults,
	WebhookQueueHarness,
	WebhookQueueMethod,
} from './types';
