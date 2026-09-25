import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { ada, bearer, type MedicalRecord, password, setup } from '../test/app';
import { bindJanus } from './bind';
import { janusErrors } from './errors';
import { byParam } from './permission';

function app() {
	const context = setup();
	const { auth, access } = context;
	const records = new Map<string, MedicalRecord>([
		['r1', { id: 'r1', doctorId: null, title: 'Blood test' }],
	]);
	const j = bindJanus({ auth, access });

	const routes = new Hono()
		.use(j.session(), j.provide())
		.post('/sign-in', async (c) => {
			const user = j.sendSession(
				c,
				await auth.patient.signIn({ email: ada.email, password }),
			);
			return c.json({ id: user.id });
		})
		.post('/sign-out', async (c) => c.json({ revoked: await j.signOut(c) }))
		.get('/me', j.session({ type: 'patient', required: true }), (c) =>
			c.json({ email: c.var.user.email }),
		)
		.get(
			'/records/:id',
			j.permission(
				'view',
				'record',
				byParam('id', (id) => records.get(id) ?? null),
			),
			(c) => c.json({ title: c.var.object.title }),
		)
		.post('/records/:id/owner', async (c) => {
			const user = c.var.user;
			if (user?.type !== 'patient') return c.body(null, 401);
			await c.var.access.grant(
				{ type: 'record', id: c.req.param('id') },
				'owner',
				user,
			);
			return c.body(null, 204);
		});
	routes.onError(janusErrors());
	return { ...context, routes };
}

describe('bindJanus()', () => {
	it('binds session, sendSession and signOut to the one auth', async () => {
		const { auth, routes } = app();
		await auth.patient.signUp({ ...ada, password });

		const signedIn = await routes.request('/sign-in', { method: 'POST' });
		expect(await signedIn.json()).toEqual({ id: expect.any(String) });
		const pair = signedIn.headers.getSetCookie()[0]?.split(';')[0] ?? '';

		const me = await routes.request('/me', { headers: { cookie: pair } });
		expect(await me.json()).toEqual({ email: ada.email });

		const out = await routes.request('/sign-out', {
			method: 'POST',
			headers: { cookie: pair },
		});
		expect(await out.json()).toEqual({ revoked: true });
		expect(
			(await routes.request('/me', { headers: { cookie: pair } })).status,
		).toBe(401);
	});

	it('binds permission and provide to the one access', async () => {
		const { auth, routes } = app();
		const { token } = await auth.patient.signUp({ ...ada, password });

		expect((await routes.request('/records/r1', bearer(token))).status).toBe(
			403,
		);
		await routes.request('/records/r1/owner', {
			method: 'POST',
			...bearer(token),
		});
		const allowed = await routes.request('/records/r1', bearer(token));
		expect(allowed.status).toBe(200);
		expect(await allowed.json()).toEqual({ title: 'Blood test' });
	});

	it('binds only what it is given', () => {
		const { auth } = setup();
		const only = bindJanus({ auth });
		expect(Object.keys(only).sort()).toEqual([
			'provide',
			'sendSession',
			'session',
			'signOut',
		]);
		const { access } = setup();
		expect(Object.keys(bindJanus({ access })).sort()).toEqual([
			'permission',
			'provide',
		]);
	});
});
