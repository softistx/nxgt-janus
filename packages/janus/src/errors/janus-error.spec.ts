import { describe, expect, it } from 'bun:test';
import {
	CredentialError,
	InvalidCursorError,
	JanusError,
	type JanusErrorCode,
	NotFoundError,
	StoreConflict,
	StoreFailure,
	TokenError,
	UnsupportedError,
	UserInactiveError,
	UserInvalidError,
} from './janus-error';

describe('JanusError', () => {
	it('carries the cause, so the driver error is not lost', () => {
		const cause = new Error('econnrefused');
		const error = new StoreFailure('the store could not answer', { cause });

		expect(error.cause).toBe(cause);
		expect(error).toBeInstanceOf(JanusError);
		expect(error).toBeInstanceOf(Error);
	});

	it('extends Error and not TypeError, so a catch needs no ordering', () => {
		// The rule is nxgt-data's: extend whichever class the refusals it
		// replaces already threw. These replace nothing, and a TypeError
		// subclass would have to be tested for BEFORE any TypeError branch.
		expect(new StoreFailure('x')).not.toBeInstanceOf(TypeError);
	});

	it('names itself, so a log line says which refusal it was', () => {
		expect(new StoreFailure('x').name).toBe('StoreFailure');
		expect(new NotFoundError('x').name).toBe('NotFoundError');
		expect(new InvalidCursorError('x').name).toBe('InvalidCursorError');
		expect(new UnsupportedError('x').name).toBe('UnsupportedError');
		expect(new UserInvalidError('x').name).toBe('UserInvalidError');
		expect(new UserInactiveError('x').name).toBe('UserInactiveError');
	});
});

describe('StoreConflict', () => {
	it('maps the constraint it names onto the code a handler switches on', () => {
		// The two are answered differently: a login collision is the caller's
		// to fix, a version conflict is a retry. A single code would make a
		// handler read the message to tell them apart.
		expect(new StoreConflict('login', 'taken').code).toBe('LOGIN_TAKEN');
		expect(new StoreConflict('version', 'stale').code).toBe('VERSION_CONFLICT');
	});

	it('reports which version was expected and which was found', () => {
		const error = new StoreConflict('version', 'stale', {
			expectedVersion: 3,
			actualVersion: 4,
		});

		expect(error.expectedVersion).toBe(3);
		expect(error.actualVersion).toBe(4);
	});
});

describe('the codes a caller switches on', () => {
	it('is exhaustive: every code has a branch, and a new one breaks the build', () => {
		// Not a test of behaviour — a test that the union is usable. If a code
		// is added and this switch is not, `answer` stops returning a string and
		// typecheck fails here rather than in an application.
		const answer = (code: JanusErrorCode): number => {
			switch (code) {
				case 'STORE_FAILED':
					return 503;
				case 'NOT_FOUND':
					return 404;
				case 'LOGIN_TAKEN':
				case 'VERSION_CONFLICT':
					return 409;
				case 'USER_INVALID':
				case 'PASSWORD_TOO_SHORT':
				case 'HASH_UNSUPPORTED':
				case 'INVALID_CURSOR':
				case 'TOKEN_UNKNOWN':
				case 'TOKEN_SPENT':
				case 'TOKEN_EXPIRED':
				case 'TOKEN_STALE':
					return 400;
				case 'CREDENTIALS_INVALID':
					return 401;
				case 'USER_INACTIVE':
					return 403;
				case 'UNSUPPORTED':
					return 501;
			}
		};

		expect(answer('STORE_FAILED')).toBe(503);
		expect(answer('USER_INACTIVE')).toBe(403);
		expect(answer('UNSUPPORTED')).toBe(501);
	});

	it('gives STORE_FAILED its own answer, and it is not 404', () => {
		// The invariant, as a test. An outage answered 404 tells everybody who
		// has an account that they do not.
		const outage = new StoreFailure('the store could not answer');

		expect(outage.code).toBe('STORE_FAILED');
		expect(outage.code).not.toBe('NOT_FOUND');
		expect(outage).not.toBeInstanceOf(NotFoundError);
	});
});

describe('no message holds a secret', () => {
	// Built by constructing each error with a sentinel and searching for it.
	// The rule this enforces is that a message reports a SHAPE, never a value:
	// no password, no hash, no session token, no token secret, no connection
	// URI — a connection string holds the password.
	const Secret = 'sentinel-super-secret-value';

	it('a password refusal reports the policy, not the password', () => {
		const error = new CredentialError(
			'PASSWORD_TOO_SHORT',
			'setPassword: the password is shorter than the policy allows',
			{ minLength: 8 },
		);

		expect(error.message).not.toContain(Secret);
		expect(error.minLength).toBe(8);
		expect(JSON.stringify({ ...error, message: error.message })).not.toContain(
			Secret,
		);
	});

	it('an unknown hash format reports the prefix, not the hash', () => {
		const error = new CredentialError(
			'HASH_UNSUPPORTED',
			'importPasswordHash: no wired verifier claims the prefix "$bcrypt$"',
			{ hashPrefix: '$bcrypt$' },
		);

		expect(error.hashPrefix).toBe('$bcrypt$');
		expect(error.message).not.toContain(Secret);
	});

	it('a token refusal names no token', () => {
		for (const code of [
			'TOKEN_UNKNOWN',
			'TOKEN_SPENT',
			'TOKEN_EXPIRED',
			'TOKEN_STALE',
		] as const) {
			const error = new TokenError(code, `resetPassword.confirm: ${code}`);
			expect(error.message).not.toContain(Secret);
		}
	});

	it('a refused sign-in says why for the logs, and names no password', () => {
		const error = new CredentialError(
			'CREDENTIALS_INVALID',
			'signIn: the login and the password do not match',
			{ reason: 'wrongPassword' },
		);

		expect(error.reason).toBe('wrongPassword');
		expect(error.message).not.toContain(Secret);
	});

	it('a login MAY appear, because the caller just sent it', () => {
		// The one exception, and it is not a leak: the address is what the
		// caller typed, and a conflict that does not say which login collided
		// is a conflict nobody can act on.
		const error = new StoreConflict(
			'login',
			'insertUser: "a@b.test" is taken',
			{
				login: 'a@b.test',
				userType: 'patient',
			},
		);

		expect(error.message).toContain('a@b.test');
		expect(error.login).toBe('a@b.test');
	});
});
