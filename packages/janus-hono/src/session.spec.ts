import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { ada, bearer, cookie, HOUR, password, setup } from '../test/app';
import { janusErrors } from './errors';
import { sendSession, session, signOut } from './session';

function app() {
	const context = setup();
	const { auth } = context;
	const routes = new Hono()
		.get('/who', session(auth), (c) =>
			c.json({
				user: c.var.user?.id ?? null,
				session: c.var.session?.id ?? null,
			}),
		)
		.get('/me', session(auth, { required: true }), (c) =>
			c.json({ user: c.var.user.id, type: c.var.user.type }),
		)
		.get('/staff', session(auth, { type: 'staff' }), (c) =>
			c.json({ type: c.var.user?.type ?? null }),
		)
		.post('/sign-in', async (c) => {
			const signedIn = await auth.patient.signIn({
				email: ada.email,
				password,
			});
			sendSession(c, auth, signedIn);
			return c.body(null, 204);
		})
		.post('/sign-out', async (c) =>
			c.json({ revoked: await signOut(c, auth) }),
		);
	routes.onError(janusErrors());
	return { ...context, routes };
}

describe('session()', () => {
	it('sets the user and the session a request presents, and null for none', async () => {
		const { auth, routes } = app();
		const {
			user,
			session: opened,
			token,
		} = await auth.patient.signUp({ ...ada, password });

		for (const init of [bearer(token), cookie(token)]) {
			const response = await routes.request('/who', init);
			expect(await response.json()).toEqual({
				user: user.id,
				session: opened.id,
			});
		}
		expect(await (await routes.request('/who')).json()).toEqual({
			user: null,
			session: null,
		});
		expect(
			await (await routes.request('/who', bearer('forged'))).json(),
		).toEqual({
			user: null,
			session: null,
		});
	});

	it('answers 401 with no body where a user is required, and never runs the route', async () => {
		const { auth, routes } = app();
		const { user, token } = await auth.patient.signUp({ ...ada, password });

		const anonymous = await routes.request('/me');
		expect(anonymous.status).toBe(401);
		expect(await anonymous.text()).toBe('');

		const signedIn = await routes.request('/me', bearer(token));
		expect(await signedIn.json()).toEqual({ user: user.id, type: 'patient' });
	});

	it('treats a user of another type than asked for as anonymous', async () => {
		const { auth, routes } = app();
		const patient = await auth.patient.signUp({ ...ada, password });
		const staff = await auth.staff.signUp({ username: 'grace', password });

		expect(
			await (await routes.request('/staff', bearer(patient.token))).json(),
		).toEqual({
			type: null,
		});
		expect(
			await (await routes.request('/staff', bearer(staff.token))).json(),
		).toEqual({
			type: 'staff',
		});
	});

	it('answers an outage 503, never 401 — and never runs the route', async () => {
		const { auth, routes, outage } = app();
		const { token } = await auth.patient.signUp({ ...ada, password });
		outage.on = true;

		for (const path of ['/who', '/me']) {
			const response = await routes.request(path, bearer(token));
			expect(response.status).toBe(503);
			expect(await response.json()).toEqual({ code: 'STORE_FAILED' });
		}
	});

	it('sends a renewed session again as a cookie, to a request that presented one', async () => {
		const { auth, clock, routes } = app();
		const { token } = await auth.patient.signUp({ ...ada, password });

		const fresh = await routes.request('/who', cookie(token));
		expect(fresh.headers.getSetCookie()).toEqual([]);

		clock.advance(25 * HOUR);
		const renewed = await routes.request('/who', cookie(token));
		const [sent] = renewed.headers.getSetCookie();
		expect(sent).toStartWith(`janus-session=${token}; Expires=`);
		expect(sent).toContain(
			new Date(Date.UTC(2026, 8, 24) + 25 * HOUR + 7 * 24 * HOUR).toUTCString(),
		);
	});

	it('never hands a cookie to a request that presented a bearer', async () => {
		const { auth, clock, routes } = app();
		const { token } = await auth.patient.signUp({ ...ada, password });

		clock.advance(25 * HOUR);
		const renewed = await routes.request('/who', bearer(token));
		expect(renewed.status).toBe(200);
		expect(renewed.headers.getSetCookie()).toEqual([]);
	});
});

describe('sendSession() and signOut()', () => {
	it('sets the cookie a later request authenticates with', async () => {
		const { auth, routes } = app();
		await auth.patient.signUp({ ...ada, password });

		const signedIn = await routes.request('/sign-in', { method: 'POST' });
		const [sent] = signedIn.headers.getSetCookie();
		const pair = sent?.split(';')[0] ?? '';

		const who = await routes.request('/who', { headers: { cookie: pair } });
		expect((await who.json()).user).not.toBeNull();
	});

	it('revokes the session and clears the cookie, whatever the answer', async () => {
		const { auth, routes } = app();
		const { token } = await auth.patient.signUp({ ...ada, password });

		const first = await routes.request('/sign-out', {
			method: 'POST',
			...cookie(token),
		});
		expect(await first.json()).toEqual({ revoked: true });
		expect(first.headers.getSetCookie()[0]).toStartWith(
			'janus-session=; Expires=Thu, 01 Jan 1970',
		);

		const unknown = await routes.request('/sign-out', {
			method: 'POST',
			...cookie('forged'),
		});
		expect(await unknown.json()).toEqual({ revoked: false });
		expect(unknown.headers.getSetCookie()).toHaveLength(1);

		expect(await (await routes.request('/who', cookie(token))).json()).toEqual({
			user: null,
			session: null,
		});
	});
});
