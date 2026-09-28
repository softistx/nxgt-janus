import { describe, expect, it } from 'bun:test';
import { webhooks } from './deliver';
import { endpoint, event, givingUps, secret, url } from './deliver.fixtures';

// What webhooks() refuses: an event it cannot send, wiring it cannot run.

describe('an event whose body cannot be built', () => {
	it("is refused at once, as the caller's mistake: nothing sent, nothing retried", async () => {
		const { sent, fetch } = endpoint(200);
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			retries: ['5ms', '5ms'],
			fetch,
			onGivingUp,
		});

		expect(() =>
			listener({ ...event, occurredAt: new Date(Number.NaN) }),
		).toThrow("webhooks: an event's occurredAt is a valid Date");
		for (const wrong of [
			{ type: 'user.signedIn' },
			{ id: undefined },
			{ userId: undefined },
			{ userType: 42 },
		]) {
			expect(() => listener({ ...event, ...wrong } as never)).toThrow(
				'webhooks: the listener takes a user event — an id, one of user.created, user.emailVerified, user.passwordReset, user.secondFactorEnabled, user.secondFactorDisabled, user.recoveryCodesRegenerated, user.recoveryCodeUsed, user.deleted, a userId and a userType',
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
		await listener.close();

		expect(sent).toEqual([]);
		expect(given).toEqual([]);
	});
});

describe('webhooks({ … }) refuses, as wiring', () => {
	const endpoints = [{ url, secrets: [secret] as [string] }];

	it.each([
		['no endpoint', { endpoints: [] }, 'webhooks: pass at least one endpoint'],
		[
			'a URL that is not one',
			{ endpoints: [{ url: 'listener', secrets: [secret] }] },
			"webhooks: an endpoint's url is not a URL",
		],
		[
			'plain http to another host',
			{ endpoints: [{ url: 'http://hooks.example.test', secrets: [secret] }] },
			"webhooks: an endpoint's url must be https:// — http:// only to localhost",
		],
		[
			'no secret',
			{ endpoints: [{ url, secrets: [] }] },
			'webhooks: an endpoint needs at least one secret',
		],
		[
			'a secret that is not whsec_',
			{ endpoints: [{ url, secrets: ['hunter2'] }] },
			'webhooks: a secret is written whsec_<base64>',
		],
		[
			'a secret longer than 64 bytes',
			{
				endpoints: [
					{ url, secrets: [`whsec_${Buffer.alloc(65).toString('base64')}`] },
				],
			},
			'webhooks: a secret holds at most 64 bytes of base64 after whsec_',
		],
		[
			'a type that is not a user event type',
			{ endpoints: [{ url, secrets: [secret], types: ['invoice.paid'] }] },
			"webhooks: an endpoint's types are user event types",
		],
		[
			'a retry that is not a duration',
			{ endpoints, retries: ['soon'] },
			'webhooks: retries',
		],
		[
			'a timeout that is not a duration',
			{ endpoints, timeout: -1 },
			'webhooks: timeout',
		],
		[
			'a retry longer than a timer can wait',
			{ endpoints, retries: ['30d'] },
			'webhooks: retries wait at most 24 days each',
		],
		[
			'a retry one day past what a timer can wait',
			{ endpoints, retries: ['25d'] },
			'webhooks: retries wait at most 24 days each',
		],
		[
			'a retry one millisecond past what a timer can wait',
			{ endpoints, retries: [2 ** 31] },
			'webhooks: retries wait at most 24 days each',
		],
		[
			'types that are not a list',
			{ endpoints: [{ url, secrets: [secret], types: 'user.deleted' }] },
			"webhooks: an endpoint's types are user event types",
		],
		[
			'a type that is only an Object.prototype key',
			{ endpoints: [{ url, secrets: [secret], types: ['toString'] }] },
			"webhooks: an endpoint's types are user event types",
		],
		[
			'retries that are not a list',
			{ endpoints, retries: '5s' },
			'webhooks: retries is a list of durations',
		],
	])('%s', (_, options, message) => {
		expect(() => webhooks(options as never)).toThrow(message);
	});

	it('takes the longest retries a timer can wait', () => {
		for (const retries of [['24d'], [2 ** 31 - 1]]) {
			expect(() =>
				webhooks({ endpoints, retries: retries as ['24d'] }),
			).not.toThrow();
		}
	});

	it('takes plain http to localhost, for development', () => {
		expect(() =>
			webhooks({
				endpoints: [{ url: 'http://localhost:3000/hooks', secrets: [secret] }],
			}),
		).not.toThrow();
	});
});
