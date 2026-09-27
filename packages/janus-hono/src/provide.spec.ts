import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { ada, app, bearer, password } from '../test/app';
import { provide } from './provide';

describe('provide()', () => {
	it('puts the permissions instance on the context, for a route to grant through', async () => {
		const { auth, routes } = app();
		const { token } = await auth.patient.signUp({ ...ada, password });

		const created = await routes.request('/records', {
			method: 'POST',
			...bearer(token),
		});
		expect(created.status).toBe(201);
		expect((await routes.request('/records/r2', bearer(token))).status).toBe(
			200,
		);
	});

	it('sets only what it was given', async () => {
		const { auth } = app();
		const seen = new Hono().get('/', provide({ auth }), (c) =>
			c.json({
				auth: c.var.auth === auth,
				access: c.get('access' as never) ?? null,
			}),
		);
		expect(await (await seen.request('/')).json()).toEqual({
			auth: true,
			access: null,
		});
	});
});
