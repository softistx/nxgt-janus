import { describe, expect, it } from 'bun:test';
import { CredentialError } from '@nxgt/janus';
import { server, setup } from '../test/harness';
import { janusGraphQLError } from './errors';

const throttled = () =>
	new CredentialError(
		'CREDENTIALS_INVALID',
		'signIn: too many passwords tried at this login — wait for the next window',
		{ reason: 'throttled', userType: 'patient', retryAfter: 840 },
	);

describe('a throttled sign-in', () => {
	it('carries retryAfter and its Retry-After header, and never the reason', () => {
		const error = janusGraphQLError(throttled());

		expect(error.message).toBe('Invalid credentials');
		expect(error.extensions).toEqual({
			code: 'CREDENTIALS_INVALID',
			http: { status: 401, headers: { 'Retry-After': '840' } },
			retryAfter: 840,
		});
	});

	it('keeps a sign-in refused for its password to its code', () => {
		const error = janusGraphQLError(
			new CredentialError('CREDENTIALS_INVALID', 'no match', {
				reason: 'wrongPassword',
			}),
		);

		expect(error.extensions).toEqual({
			code: 'CREDENTIALS_INVALID',
			http: { status: 401 },
		});
	});

	it('is answered through Yoga with its status and the Retry-After header', async () => {
		const yoga = server(
			setup(),
			'type Mutation { signIn: String } type Query { a: String }',
			{
				// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
				Mutation: {
					signIn: () => {
						throw throttled();
					},
				},
			},
		);

		const response = await yoga.fetch('http://yoga.test/graphql', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: 'mutation { signIn }' }),
		});
		const body = (await response.json()) as {
			errors?: { extensions?: unknown }[];
		};

		expect(response.status).toBe(401);
		expect(response.headers.get('retry-after')).toBe('840');
		expect(body.errors?.[0]?.extensions).toEqual({
			code: 'CREDENTIALS_INVALID',
			retryAfter: 840,
		});
	});
});
