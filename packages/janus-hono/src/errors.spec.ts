import { describe, expect, it } from 'bun:test';
import {
	CredentialError,
	type JanusErrorCode,
	NotFoundError,
	StoreFailure,
	UserInvalidError,
} from '@nxgt/janus';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyOf, janusErrors, statusOf } from './errors';

function throwing(
	error: unknown,
	fallback?: Parameters<typeof janusErrors>[0],
) {
	const app = new Hono().get('/', () => {
		throw error;
	});
	app.onError(janusErrors(fallback));
	return app.request('/');
}

describe('janusErrors()', () => {
	it('answers a store failure 503 — an outage is not a negative answer', async () => {
		const response = await throwing(
			new StoreFailure('down', { slot: 'users', operation: 'findUser' }),
		);
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ code: 'STORE_FAILED' });
	});

	it('answers the fields that failed, and never why a sign-in did', async () => {
		const invalid = await throwing(
			new UserInvalidError('bad', {
				issues: [{ path: ['email'], message: 'Invalid email' }],
			}),
		);
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toEqual({
			code: 'USER_INVALID',
			issues: [{ path: ['email'], message: 'Invalid email' }],
		});

		const short = await throwing(
			new CredentialError('PASSWORD_TOO_SHORT', 'short', { minLength: 12 }),
		);
		expect(await short.json()).toEqual({
			code: 'PASSWORD_TOO_SHORT',
			minLength: 12,
		});

		const wrong = await throwing(
			new CredentialError('CREDENTIALS_INVALID', 'no such login', {
				reason: 'unknownLogin',
				login: 'ada@example.test',
			}),
		);
		expect(wrong.status).toBe(401);
		expect(await wrong.json()).toEqual({ code: 'CREDENTIALS_INVALID' });
	});

	it("leaves anything else to Hono's own handling, or to the fallback given", async () => {
		const exception = await throwing(
			new HTTPException(418, { message: 'teapot' }),
		);
		expect(exception.status).toBe(418);

		// What the route set before throwing stays, as with Hono's own handler.
		const app = new Hono().get('/', (c) => {
			c.header('Set-Cookie', 'janus-session=kept');
			throw new HTTPException(403);
		});
		app.onError(janusErrors());
		const kept = await app.request('/');
		expect(kept.status).toBe(403);
		expect(kept.headers.getSetCookie()).toEqual(['janus-session=kept']);

		const original = console.error;
		console.error = () => {};
		try {
			const bug = await throwing(new Error('a bug'));
			expect(bug.status).toBe(500);
		} finally {
			console.error = original;
		}

		const handled = await throwing(new Error('a bug'), (_, c) =>
			c.text('mine', 502),
		);
		expect(handled.status).toBe(502);
		expect(await handled.text()).toBe('mine');
	});
});

describe('statusOf()', () => {
	it('gives every code a status, and 503 to STORE_FAILED alone', () => {
		const codes: JanusErrorCode[] = [
			'STORE_FAILED',
			'NOT_FOUND',
			'LOGIN_TAKEN',
			'VERSION_CONFLICT',
			'USER_INVALID',
			'PASSWORD_TOO_SHORT',
			'CREDENTIALS_INVALID',
			'HASH_UNSUPPORTED',
			'USER_INACTIVE',
			'TOKEN_UNKNOWN',
			'TOKEN_SPENT',
			'TOKEN_EXPIRED',
			'TOKEN_STALE',
			'INVALID_CURSOR',
			'UNSUPPORTED',
			'PERMISSION_DEPTH',
		];
		expect(codes.filter((code) => statusOf(code) === 503)).toEqual([
			'STORE_FAILED',
		]);
		for (const code of codes)
			expect(statusOf(code)).toBeGreaterThanOrEqual(400);
	});

	it('keeps a body to its code for every other refusal', () => {
		expect(bodyOf(new NotFoundError('gone'))).toEqual({ code: 'NOT_FOUND' });
	});
});
