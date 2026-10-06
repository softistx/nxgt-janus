import { describe, expect, it } from 'bun:test';
import {
	CredentialError,
	NotFoundError,
	PermissionDepthError,
	StoreFailure,
	TokenError,
	UserInvalidError,
} from '@nxgt/janus';
import { GraphQLError } from 'graphql';
import { ask, server, setup } from '../test/harness';
import { denial, janusGraphQLError, janusMaskError } from './errors';

describe('janusGraphQLError()', () => {
	it('answers STORE_FAILED as SERVICE_UNAVAILABLE, 503, with no word of the store', () => {
		const error = janusGraphQLError(
			new StoreFailure('users.findUser: the store could not answer', {
				slot: 'users',
				operation: 'findUser',
			}),
		);
		expect(error.message).toBe('The service is unavailable, retry later');
		expect(error.extensions).toEqual({
			code: 'SERVICE_UNAVAILABLE',
			http: { status: 503 },
		});
	});

	it('answers any other code as itself, with its status', () => {
		expect(janusGraphQLError(new NotFoundError('gone')).extensions).toEqual({
			code: 'NOT_FOUND',
			http: { status: 404 },
		});
		expect(
			janusGraphQLError(
				new CredentialError('CREDENTIALS_INVALID', 'no match', {
					reason: 'unknownLogin',
				}),
			).extensions,
		).toEqual({ code: 'CREDENTIALS_INVALID', http: { status: 401 } });
	});

	it('carries what the client can act on, and never the reason or the login', () => {
		const invalid = janusGraphQLError(
			new UserInvalidError('bad', {
				issues: [{ path: ['email'], message: 'Invalid email' }],
				login: 'ada@example.test',
			}),
		);
		expect(invalid.extensions).toEqual({
			code: 'USER_INVALID',
			http: { status: 400 },
			issues: [{ path: ['email'], message: 'Invalid email' }],
		});
		const wrong = janusGraphQLError(
			new TokenError('CODE_INVALID', 'no match', { attemptsLeft: 2 }),
		);
		expect(wrong.extensions).toEqual({
			code: 'CODE_INVALID',
			http: { status: 401 },
			attemptsLeft: 2,
		});
	});

	it("never sends the core's message: a hash prefix is for your logs", () => {
		const error = janusGraphQLError(
			new CredentialError(
				'HASH_UNSUPPORTED',
				'patient.signIn: no wired verifier claims the prefix "$2b$"',
				{ hashPrefix: '$2b$' },
			),
		);
		expect(error.message).toBe('Invalid request');
		expect(error.extensions).toEqual({
			code: 'HASH_UNSUPPORTED',
			http: { status: 400 },
		});
	});

	it('keeps a 500 message generic', () => {
		const error = janusGraphQLError(
			new PermissionDepthError('view walked past 25', {
				permission: 'view',
				maxDepth: 25,
			}),
		);
		expect(error.message).toBe('Internal server error');
		expect(error.extensions.http).toEqual({ status: 500 });
	});
});

describe('denial()', () => {
	it('answers each denial with its status', () => {
		expect(denial('UNAUTHENTICATED').extensions).toEqual({
			code: 'UNAUTHENTICATED',
			http: { status: 401 },
		});
		expect(denial('FORBIDDEN').extensions.http).toEqual({ status: 403 });
		expect(denial('NOT_FOUND', 'No such record').message).toBe(
			'No such record',
		);
	});
});

describe('janusMaskError()', () => {
	const mask = janusMaskError();

	it('answers a JanusError a resolver threw with its code, at its path', () => {
		const thrown = new GraphQLError('down', {
			path: ['record'],
			originalError: new StoreFailure('down'),
		});
		const masked = mask(thrown, 'Unexpected error.') as GraphQLError;
		expect(masked.path).toEqual(['record']);
		expect(masked.extensions['code']).toBe('SERVICE_UNAVAILABLE');
	});

	it('keeps a GraphQLError of its own, and masks anything else', () => {
		const own = denial('FORBIDDEN');
		expect(mask(own, 'Unexpected error.')).toBe(own);

		const bug = new GraphQLError('secret detail', {
			originalError: new Error('secret detail'),
		});
		const masked = mask(bug, 'Unexpected error.') as GraphQLError;
		expect(masked.message).toBe('Unexpected error.');
		expect(masked.extensions['code']).toBe('INTERNAL_SERVER_ERROR');
	});

	it('hands anything but a JanusError to the fallback it was given', () => {
		const fallback = new Error('fallback');
		const masking = janusMaskError(() => fallback);
		expect(masking(new Error('x'), 'Unexpected error.')).toBe(fallback);
		expect(
			(masking(new StoreFailure('down'), 'Unexpected error.') as GraphQLError)
				.extensions['code'],
		).toBe('SERVICE_UNAVAILABLE');
	});

	it('answers a JanusError from a resolver through Yoga with its status', async () => {
		const yoga = server(setup(), 'type Query { record: String }', {
			// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
			Query: {
				record: () => {
					throw new NotFoundError('gone');
				},
			},
		});
		const { status, body } = await ask(yoga, '{ record }');
		expect(status).toBe(404);
		expect(body.errors?.[0]?.extensions).toEqual({ code: 'NOT_FOUND' });
	});
});
