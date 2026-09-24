import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { ada, bearer, type MedicalRecord, password, setup } from '../test/app';
import { janusErrors } from './errors';
import { permission } from './permission';
import { provide } from './provide';
import { session } from './session';

function app() {
	const context = setup();
	const { auth, access } = context;
	const records = new Map<string, MedicalRecord>([
		['r1', { id: 'r1', doctorId: null, title: 'Blood test' }],
	]);
	const loads: string[] = [];
	// `c.req.param()` in a middleware is `string | undefined`: Hono types the
	// path in the route's own handler only.
	const load = (id: string | undefined) => {
		if (id === undefined) return null;
		loads.push(id);
		return records.get(id) ?? null;
	};

	const routes = new Hono()
		.use(session(auth))
		.get(
			'/records/:id',
			permission(access, 'view', 'record', (c) => load(c.req.param('id'))),
			(c) => c.json({ title: c.var.object.title }),
		)
		.put(
			'/records/:id',
			permission(access, 'edit', 'record', (c) => load(c.req.param('id')), {
				ctx: (c) => ({ locked: c.req.header('x-locked') === 'yes' }),
			}),
			(c) => c.body(null, 204),
		)
		.get(
			'/as/:subject/records/:id',
			permission(access, 'view', 'record', (c) => load(c.req.param('id')), {
				subject: (c) => ({ type: 'patient', id: c.req.param('subject') ?? '' }),
			}),
			(c) => c.json({ title: c.var.object.title }),
		)
		.post(
			'/records',
			session(auth, { type: 'patient', required: true }),
			provide({ access }),
			async (c) => {
				const record = { id: 'r2', doctorId: null, title: 'X-ray' };
				records.set(record.id, record);
				await c.var.access.grant(
					{ type: 'record', id: record.id },
					'owner',
					c.var.user,
				);
				return c.json({ id: record.id }, 201);
			},
		);
	routes.onError(janusErrors());
	return { ...context, routes, records, loads };
}

describe('permission()', () => {
	it('runs the route with the loaded object when the subject holds the permission', async () => {
		const { auth, access, routes } = app();
		const { user, token } = await auth.patient.signUp({ ...ada, password });
		await access.grant({ type: 'record', id: 'r1' }, 'owner', user);

		const response = await routes.request('/records/r1', bearer(token));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ title: 'Blood test' });
	});

	it('answers 403 to a denial, 404 to nothing loaded, and 401 before loading anything', async () => {
		const { auth, routes, loads } = app();
		const { token } = await auth.patient.signUp({ ...ada, password });

		expect((await routes.request('/records/r1', bearer(token))).status).toBe(
			403,
		);
		expect((await routes.request('/records/gone', bearer(token))).status).toBe(
			404,
		);

		loads.length = 0;
		const anonymous = await routes.request('/records/r1');
		expect(anonymous.status).toBe(401);
		expect(await anonymous.text()).toBe('');
		expect(loads).toEqual([]);
	});

	it('passes the loaded fields a fromField reads', async () => {
		const { auth, routes, records } = app();
		const { user, token } = await auth.staff.signUp({
			username: 'grace',
			password,
		});
		records.set('r1', { id: 'r1', doctorId: user.id, title: 'Blood test' });

		expect((await routes.request('/records/r1', bearer(token))).status).toBe(
			200,
		);
	});

	it("reads a condition's context from the request", async () => {
		const { auth, access, routes } = app();
		const { user, token } = await auth.patient.signUp({ ...ada, password });
		await access.grant({ type: 'record', id: 'r1' }, 'owner', user);

		const put = (locked: string) =>
			routes.request('/records/r1', {
				method: 'PUT',
				headers: { ...bearer(token).headers, 'x-locked': locked },
			});
		expect((await put('no')).status).toBe(204);
		expect((await put('yes')).status).toBe(403);
	});

	it('takes the subject from elsewhere when told to', async () => {
		const { auth, access, routes } = app();
		const { user } = await auth.patient.signUp({ ...ada, password });
		await access.grant({ type: 'record', id: 'r1' }, 'owner', user);

		expect((await routes.request(`/as/${user.id}/records/r1`)).status).toBe(
			200,
		);
		expect((await routes.request('/as/someone/records/r1')).status).toBe(403);
	});

	it('answers an outage 503, never 403', async () => {
		const { auth, access, routes, outage } = app();
		const { user, token } = await auth.patient.signUp({ ...ada, password });
		await access.grant({ type: 'record', id: 'r1' }, 'owner', user);
		outage.on = true;

		const response = await routes.request(
			`/as/${user.id}/records/r1`,
			bearer(token),
		);
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ code: 'STORE_FAILED' });
	});

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
});

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
