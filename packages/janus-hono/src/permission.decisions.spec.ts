import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { ada, app, bearer, password } from '../test/app';
import { permission } from './permission';
import { session } from './session';

// What permission() answers a request: the route run with its object, or a
// 401, 403, 404 or 503.

describe('permission()', () => {
	it('runs the route with the loaded object when the subject holds the permission', async () => {
		const { auth, access, routes } = app();
		const { user, token } = await auth.patient.signUp({ ...ada, password });
		await access.grant({ type: 'record', id: 'r1' }, 'owners', user);

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
		expect((await routes.request('/records', bearer(token))).status).toBe(404);
		expect(loads).toEqual([]); // no :id, nothing asked of the store

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
		await access.grant({ type: 'record', id: 'r1' }, 'owners', user);

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
		await access.grant({ type: 'record', id: 'r1' }, 'owners', user);

		expect((await routes.request(`/as/${user.id}/records/r1`)).status).toBe(
			200,
		);
		expect((await routes.request('/as/someone/records/r1')).status).toBe(403);
	});

	it('answers an outage 503, never 403', async () => {
		const { auth, access, routes, outage, loads } = app();
		const { user } = await auth.patient.signUp({ ...ada, password });
		await access.grant({ type: 'record', id: 'r1' }, 'owners', user);
		outage.on = true;

		// No session credential: the only store call is the relation store's,
		// inside can().
		const response = await routes.request(`/as/${user.id}/records/r1`);
		expect(loads).toEqual(['r1']);
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ code: 'STORE_FAILED' });
	});

	it('reads the fields of a class instance through its getters', async () => {
		const { auth, access } = app();
		const { user, token } = await auth.staff.signUp({
			username: 'grace',
			password,
		});
		class Chart {
			readonly #doctor: string;
			constructor(
				readonly id: string,
				doctor: string,
				readonly type = 'lab',
			) {
				this.#doctor = doctor;
			}
			get doctorId() {
				return this.#doctor;
			}
		}
		const chart = new Chart('c1', user.id);
		const routes = new Hono().use(session(auth)).get(
			'/',
			permission(access, 'view', 'record', () => chart),
			(c) => c.json({ same: c.var.object === chart, type: c.var.object.type }),
		);

		const response = await routes.request('/', bearer(token));
		expect(await response.json()).toEqual({ same: true, type: 'lab' });
	});

	it('treats a subject answered as undefined as anonymous', async () => {
		const { access } = app();
		let loaded = false;
		const routes = new Hono().get(
			'/',
			permission(
				access,
				'view',
				'record',
				() => {
					loaded = true;
					return null;
				},
				{ subject: () => undefined as never },
			),
			(c) => c.body(null),
		);
		expect((await routes.request('/')).status).toBe(401);
		expect(loaded).toBe(false);
	});
});
