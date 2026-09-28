import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { ada, bearer, password, setup } from '../test/app';
import { janusErrors } from './errors';
import { fresh } from './fresh';
import { session } from './session';

function app() {
	const context = setup();
	const { auth, clock } = context;
	const routes = new Hono()
		.delete('/account', session(auth), fresh('10m', { clock }), (c) =>
			c.body(null, 204),
		)
		.post('/step-up', session(auth, { required: true }), async (c) => {
			const issued = await auth.patient.stepUp.request(c.var.user.id);
			if (issued.via !== 'email') throw new Error('expected an e-mailed code');
			return c.json({ challenge: issued.challenge, code: issued.code });
		})
		.post('/step-up/confirm', async (c) => {
			const { challenge, code } = await c.req.json();
			const confirmed = await auth.patient.stepUp.confirm(
				c.req.raw,
				challenge,
				code,
			);
			return c.json({ authenticatedAt: confirmed.authenticatedAt });
		});
	routes.onError(janusErrors());
	return { ...context, routes };
}

async function signedIn(context: ReturnType<typeof app>) {
	await context.auth.patient.signUp({ ...ada, password });
	const signed = await context.auth.patient.signIn({
		email: ada.email,
		password,
	});
	if (signed.status !== 'signedIn') throw new Error('expected a session');
	return bearer(signed.token).headers;
}

describe('fresh()', () => {
	it('lets a session signed in less than maxAge ago through', async () => {
		const context = app();
		const headers = await signedIn(context);
		context.clock.advance(9 * 60_000);

		const response = await context.routes.request('/account', {
			method: 'DELETE',
			headers,
		});
		expect(response.status).toBe(204);
	});

	it('answers an older one 403 STEP_UP_REQUIRED, and lets it through once a step-up confirmed it', async () => {
		const context = app();
		const { routes, clock } = context;
		const headers = await signedIn(context);
		clock.advance(60 * 60_000);

		const refused = await routes.request('/account', {
			method: 'DELETE',
			headers,
		});
		expect(refused.status).toBe(403);
		expect(await refused.json()).toEqual({ code: 'STEP_UP_REQUIRED' });

		const issued = await (
			await routes.request('/step-up', { method: 'POST', headers })
		).json();
		const confirmed = await routes.request('/step-up/confirm', {
			method: 'POST',
			headers: { ...headers, 'content-type': 'application/json' },
			body: JSON.stringify(issued),
		});
		expect(confirmed.status).toBe(200);

		const allowed = await routes.request('/account', {
			method: 'DELETE',
			headers,
		});
		expect(allowed.status).toBe(204);
	});

	it('answers an anonymous request 401, with no body', async () => {
		const response = await app().routes.request('/account', {
			method: 'DELETE',
		});
		expect(response.status).toBe(401);
		expect(await response.text()).toBe('');
	});

	it('throws a TypeError when no session() runs before it', async () => {
		let thrown: unknown;
		const routes = new Hono()
			.get('/', fresh('10m'), (c) => c.body(null, 204))
			.onError((error, c) => {
				thrown = error;
				return c.body(null, 500);
			});

		expect((await routes.request('/')).status).toBe(500);
		expect(thrown).toBeInstanceOf(TypeError);
		expect((thrown as Error).message).toBe(
			'fresh(): c.var.session is not set — put session(auth) before it',
		);
	});

	it('refuses a maxAge that is no duration when the app is wired', () => {
		expect(() => fresh('10 minutes' as unknown as '10m')).toThrow(TypeError);
	});
});
