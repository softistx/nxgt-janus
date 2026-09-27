import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { ada, app, bearer, password } from '../test/app';
import { permission } from './permission';
import { session } from './session';

// What permission() refuses as wiring: an error thrown, never an answer.

describe('permission()', () => {
	it('refuses to run without session() or a subject: a wiring error, not a 401', async () => {
		const { access } = app();
		const bare = new Hono().get(
			'/',
			permission(access, 'view', 'record', () => ({
				id: 'r1',
				doctorId: null,
			})),
			(c) => c.body(null),
		);
		let thrown: unknown;
		bare.onError((error, c) => {
			thrown = error;
			return c.body(null, 500);
		});

		expect((await bare.request('/')).status).toBe(500);
		expect(thrown).toBeInstanceOf(TypeError);
		expect((thrown as Error).message).toContain('put session(auth) before it');
	});

	it('refuses a second permission() on one route: both would claim c.var.object', async () => {
		const { auth, access } = app();
		const { user, token } = await auth.patient.signUp({ ...ada, password });
		await access.grant({ type: 'record', id: 'r1' }, 'owners', user);
		const record = { id: 'r1', doctorId: null };
		const twice = new Hono().use(session(auth)).get(
			'/',
			permission(access, 'view', 'record', () => record),
			permission(access, 'view', 'record', () => record),
			(c) => c.body(null),
		);
		let thrown: unknown;
		twice.onError((error, c) => {
			thrown = error;
			return c.body(null, 500);
		});

		expect((await twice.request('/', bearer(token))).status).toBe(500);
		expect((thrown as Error).message).toContain('one permission() per route');
	});
});
