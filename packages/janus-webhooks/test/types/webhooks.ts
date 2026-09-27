/**
 * What `webhooks()` refuses at compile time, and what it fits: each
 * `@ts-expect-error` is a mistake that must not compile. Checked by
 * `tsc --noEmit`, never run.
 */

import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import {
	createMemoryWebhookQueue,
	type GivingUp,
	verifyWebhook,
	type WebhookQueue,
	webhooks,
} from '../../src/index';

const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const url = 'https://hooks.example.test/janus';

// What janus({ events }) takes: the delivery is the listener.
const listener = webhooks({ endpoints: [{ url, secrets: [secret] }] });
janus({
	user: z.strictObject({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	events: listener,
});
const closing: Promise<void> = listener.close();

// An endpoint with no secret: signed by nothing.
// @ts-expect-error secrets holds at least one
webhooks({ endpoints: [{ url, secrets: [] }] });

// A secret read from the environment may be missing.
// @ts-expect-error string | undefined is not a secret
webhooks({ endpoints: [{ url, secrets: [process.env.WEBHOOK_SECRET] }] });

// A type janus never sends.
// @ts-expect-error the six user event types, no other
webhooks({ endpoints: [{ url, secrets: [secret], types: ['user.signedIn'] }] });

// A retry written as a bare string.
// @ts-expect-error a Duration: a number of ms, or '5s', '5m', '2h'…
webhooks({ endpoints: [{ url, secrets: [secret] }], retries: ['soon'] });

// A receiver with no secret would vouch for nothing.
// @ts-expect-error secrets holds at least one
verifyWebhook({ secrets: [], headers: {}, body: '' });

// A queue shared by every process, and the listener janus takes from it.
const queue = createMemoryWebhookQueue();
const queued = webhooks({
	endpoints: [{ id: 'crm', url, secrets: [secret] }],
	queue,
});
janus({
	user: z.strictObject({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	events: queued,
});

// A queue missing a method would lose deliveries on the first retry.
const { extendLease: _, ...partial } = queue;
// @ts-expect-error a WebhookQueue implements all six methods
webhooks({ endpoints: [{ url, secrets: [secret] }], queue: partial });

// A concurrency read from the environment, not parsed.
// @ts-expect-error a number of requests
webhooks({ endpoints: [{ url, secrets: [secret] }], concurrency: '4' });

// An endpoint id written as a number.
// @ts-expect-error an id is a string
webhooks({ endpoints: [{ id: 1, url, secrets: [secret] }] });

// A switch written for 0.1.0's two reasons misses the third.
function explain(reason: GivingUp): string {
	switch (reason.why) {
		case 'retriesRanOut':
			return 'every attempt failed';
		case 'closed':
			return 'close() came first';
		default: {
			// @ts-expect-error 'endpointRemoved' is a reason too
			const exhausted: never = reason.why;
			return exhausted;
		}
	}
}

// A delivery to an endpoint no longer configured names no URL.
webhooks({
	endpoints: [{ id: 'crm', url, secrets: [secret] }],
	queue,
	// @ts-expect-error url is string | null: null once the endpoint is removed
	onGivingUp: (delivery) => delivery.url.length,
});

// With a queue, the listener's answer is the insert, to await.
const inserted: Promise<void> | undefined = queued({
	id: '0199a0db-f800-7000-8000-000000000001',
	type: 'user.created',
	occurredAt: new Date(),
	userId: '0199a0db-f800-7000-8000-000000000002',
	userType: 'user',
});
const shared: WebhookQueue = queue;

// A verified request may be a forgery: null until checked.
const received = verifyWebhook({ secrets: [secret], headers: {}, body: '' });
// @ts-expect-error UserEvent | null
const userId: string = received.userId;

export { closing, explain, inserted, shared, userId };
