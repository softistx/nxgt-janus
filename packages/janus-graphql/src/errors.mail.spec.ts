import { describe, expect, it } from 'bun:test';
import { MailThrottledError } from '@nxgt/janus';
import { server, setup } from '../test/harness';
import { janusGraphQLError } from './errors';

const throttled = () =>
	new MailThrottledError(
		'magicLink.request: too many e-mails asked for this address — wait for the next window',
		{ userType: 'patient', retryAfter: 840 },
	);

describe('a request past its e-mails', () => {
	it('is MAIL_THROTTLED 429, with retryAfter and its Retry-After header', () => {
		const error = janusGraphQLError(throttled());

		expect(error.message).toBe('Too many requests, retry later');
		expect(error.extensions).toEqual({
			code: 'MAIL_THROTTLED',
			http: { status: 429, headers: { 'Retry-After': '840' } },
			retryAfter: 840,
		});
	});

	it('is answered through Yoga with its status and the Retry-After header', async () => {
		const yoga = server(
			setup(),
			'type Mutation { requestLink: Boolean } type Query { a: String }',
			{
				// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
				Mutation: {
					requestLink: () => {
						throw throttled();
					},
				},
			},
		);

		const response = await yoga.fetch('http://yoga.test/graphql', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: 'mutation { requestLink }' }),
		});
		const body = (await response.json()) as {
			errors?: { extensions?: unknown }[];
		};

		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('840');
		expect(body.errors?.[0]?.extensions).toEqual({
			code: 'MAIL_THROTTLED',
			retryAfter: 840,
		});
	});
});
