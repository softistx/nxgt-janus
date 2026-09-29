import { describe, expect, it } from 'bun:test';
import {
	createMemoryStores,
	fixedClock,
	janus,
	scryptHasher,
} from '@nxgt/janus';
import { Hono } from 'hono';
import { z } from 'zod';
import { ada, password } from '../test/app';
import { bindJanus } from './bind';
import { deviceOf } from './device';
import { sendSession } from './session';

function app(options: { name?: string; maxAge?: number } = {}) {
	const received: string[] = [];
	const auth = janus({
		user: z.strictObject({ email: z.email(), name: z.string() }),
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher: scryptHasher({ cost: 10 }),
		clock: fixedClock(Date.UTC(2026, 8, 29)),
		devices: {
			keys: [{ id: 'd1', key: Buffer.alloc(32, 7).toString('base64') }],
		},
		events: (event) => void received.push(event.type),
	});
	const device = options;
	const j = bindJanus({ auth });
	const routes = new Hono()
		.post('/sign-up', async (c) => {
			const signedUp = await auth.signUp(
				{ ...ada, password },
				{ device: deviceOf(c, device) },
			);
			return c.json({ id: sendSession(c, auth, signedUp, { device }).id });
		})
		.post('/sign-in', async (c) => {
			const signedIn = await auth.signIn(
				{ email: ada.email, password },
				{ device: deviceOf(c, device) },
			);
			j.sendSession(c, signedIn, { device });
			return c.json({ newDevice: signedIn.newDevice });
		})
		.post('/untracked', async (c) => {
			const signedIn = await auth.signIn({ email: ada.email, password });
			sendSession(c, auth, signedIn);
			return c.json({});
		});
	return { routes, received };
}

/** The device cookie a response set, as `name=value`, with its attributes. */
function deviceCookie(response: Response, name = 'janus-device') {
	return response.headers
		.getSetCookie()
		.find((value) => value.startsWith(`${name}=`));
}

const presenting = (set: string | undefined) => ({
	method: 'POST',
	headers: { cookie: (set ?? '').split(';')[0] as string },
});

describe('deviceOf() and sendSession()', () => {
	it('set the device cookie at sign-up, long-lived and out of reach of scripts', async () => {
		const { routes } = app();
		const response = await routes.request('/sign-up', { method: 'POST' });

		const set = deviceCookie(response);
		expect(set).toMatch(/^janus-device=d1\.d1\./);
		expect(set).toContain('Max-Age=34560000');
		expect(set).toContain('HttpOnly');
		expect(set).toContain('Secure');
		expect(set).toContain('SameSite=Lax');
		expect(set).toContain('Path=/');
	});

	it('read it back at the next sign-in: known, and the cookie sent again', async () => {
		const { routes, received } = app();
		const set = deviceCookie(
			await routes.request('/sign-up', { method: 'POST' }),
		);

		const response = await routes.request('/sign-in', presenting(set));

		expect(await response.json()).toEqual({ newDevice: false });
		expect(deviceCookie(response)?.split(';')[0]).toBe(set?.split(';')[0]);
		expect(received).not.toContain('user.newDeviceSignedIn');
	});

	it('a browser with no device cookie: null, a new device, and a cookie set', async () => {
		const { routes, received } = app();
		await routes.request('/sign-up', { method: 'POST' });

		const response = await routes.request('/sign-in', { method: 'POST' });

		expect(await response.json()).toEqual({ newDevice: true });
		expect(deviceCookie(response)).toMatch(/^janus-device=d1\./);
		expect(received).toContain('user.newDeviceSignedIn');
	});

	it('take the same name and age as options', async () => {
		const { routes } = app({ name: 'dev', maxAge: 60 });
		const set = deviceCookie(
			await routes.request('/sign-up', { method: 'POST' }),
			'dev',
		);
		expect(set).toContain('Max-Age=60');

		const response = await routes.request('/sign-in', presenting(set));

		expect(await response.json()).toEqual({ newDevice: false });
	});

	it('set no device cookie for a sign-in given no device', async () => {
		const { routes } = app();
		await routes.request('/sign-up', { method: 'POST' });

		const response = await routes.request('/untracked', { method: 'POST' });

		expect(deviceCookie(response)).toBeUndefined();
		expect(response.headers.getSetCookie()).toHaveLength(1);
	});
});
