import { describe, expect, it } from 'bun:test';
import { webhooks } from './deliver';
import {
	endpoint,
	event,
	secret,
	until,
	url,
	watchWarnings,
} from './deliver.fixtures';

// What a delivery given up with no onGivingUp to hear it warns: never the URL.

describe('giving up, unheard', () => {
	const warnings = watchWarnings();

	it('is a JANUS_WEBHOOK_GAVE_UP warning naming the event and the origin, never the URL', async () => {
		const { fetch } = endpoint(410);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: [],
			fetch,
		});

		listener(event);
		await listener.close();
		await until(() => warnings.length === 1);

		const [warning] = warnings;
		expect((warning as Error & { code?: string }).code).toBe(
			'JANUS_WEBHOOK_GAVE_UP',
		);
		expect(warning?.message).toContain(event.id);
		expect(warning?.message).toContain('user.created');
		expect(warning?.message).toContain('https://hooks.example.test');
		expect(warning?.message).toContain('after 1 attempt (retriesRanOut, 410)');
		// The path and query may hold a token of the receiver's.
		expect(warning?.message).not.toContain('sentinel');
	});

	it('is a JANUS_WEBHOOK_REPORT_FAILED warning when onGivingUp throws', async () => {
		const { fetch } = endpoint(500);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: [],
			fetch,
			onGivingUp: () => {
				throw new Error('dead letters full');
			},
		});

		listener(event);
		await listener.close();
		await until(() => warnings.length === 1);

		expect((warnings[0] as Error & { code?: string }).code).toBe(
			'JANUS_WEBHOOK_REPORT_FAILED',
		);
		expect(warnings[0]?.message).not.toContain('dead letters');
	});
});
