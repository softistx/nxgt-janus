import { describe, expect, it } from 'bun:test';
import {
	CredentialError,
	type JanusErrorCode,
	NotFoundError,
	StoreFailure,
	TokenError,
	UserInvalidError,
} from '@nxgt/janus';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
	bodyOf,
	type JanusErrorsOptions,
	janusErrors,
	statusOf,
} from './errors';

function throwing(error: unknown, options?: JanusErrorsOptions) {
	const app = new Hono().get('/', () => {
		throw error;
	});
	app.onError(janusErrors(options));
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

		const handled = await throwing(new Error('a bug'), {
			fallback: (_, c) => c.text('mine', 502),
		});
		expect(handled.status).toBe(502);
		expect(await handled.text()).toBe('mine');
	});

	it('reports what the server must fix, before answering it — and nothing else', async () => {
		const reported: string[] = [];
		const report = (error: { readonly code: string }) => {
			reported.push(error.code);
		};

		const outage = await throwing(
			new StoreFailure('down', { slot: 'users', operation: 'findUser' }),
			{ report },
		);
		await throwing(new NotFoundError('gone'), { report });
		await throwing(
			new CredentialError('CREDENTIALS_INVALID', 'wrong', {
				reason: 'wrongPassword',
			}),
			{ report },
		);
		await throwing(new Error('a bug'), {
			report,
			fallback: (_, c) => c.text('mine', 500),
		});

		expect(outage.status).toBe(503);
		expect(reported).toEqual(['STORE_FAILED']);
	});

	it('answers the outage even when report fails: a warning, never a lost 503', async () => {
		const warnings: string[] = [];
		const warn = (warning: string | Error) => {
			warnings.push(String(warning));
		};
		process.on('warning', warn);
		try {
			const outage = () =>
				new StoreFailure('down', { slot: 'users', operation: 'findUser' });
			const thrown = await throwing(outage(), {
				report: () => {
					throw new Error('logger down');
				},
			});
			const rejected = await throwing(outage(), {
				report: async () => {
					throw new Error('logger down');
				},
			});
			expect(thrown.status).toBe(503);
			expect(rejected.status).toBe(503);
			await new Promise((resolve) => setTimeout(resolve, 10));
		} finally {
			process.off('warning', warn);
		}
		expect(warnings.filter((w) => w.includes('report failed'))).toHaveLength(2);
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
			'CODE_INVALID',
			'SECOND_FACTOR_NOT_ENROLLED',
			'SECOND_FACTOR_ACTIVE',
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

	it('answers a wrong code 401, with the attempts its challenge has left', () => {
		const wrong = new TokenError('CODE_INVALID', 'no match', {
			attemptsLeft: 2,
			userId: 'u1',
		});
		expect(statusOf(wrong.code)).toBe(401);
		expect(bodyOf(wrong)).toEqual({ code: 'CODE_INVALID', attemptsLeft: 2 });
		expect(bodyOf(new TokenError('CODE_INVALID', 'no match'))).toEqual({
			code: 'CODE_INVALID',
		});
	});
});
