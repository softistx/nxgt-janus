/**
 * What `webhooks()` refuses at compile time, and what it fits: each
 * `@ts-expect-error` is a mistake that must not compile. Checked by
 * `tsc --noEmit`, never run.
 */

import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { verifyWebhook, webhooks } from '../../src/index';

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
// @ts-expect-error the four user event types, no other
webhooks({ endpoints: [{ url, secrets: [secret], types: ['user.signedIn'] }] });

// A retry written as a bare string.
// @ts-expect-error a Duration: a number of ms, or '5s', '5m', '2h'…
webhooks({ endpoints: [{ url, secrets: [secret] }], retries: ['soon'] });

// A receiver with no secret would vouch for nothing.
// @ts-expect-error secrets holds at least one
verifyWebhook({ secrets: [], headers: {}, body: '' });

// A verified request may be a forgery: null until checked.
const received = verifyWebhook({ secrets: [secret], headers: {}, body: '' });
// @ts-expect-error UserEvent | null
const userId: string = received.userId;

export { closing, userId };
