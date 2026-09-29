/**
 * What the compiler refuses, measured: each `@ts-expect-error` below is a
 * plausible mistake, and fails the typecheck the day it compiles.
 */

import { Hono } from 'hono';
import { deviceOf, sendSession } from '../../src/index';
import { setup } from '../app';

const { auth } = setup();

new Hono().post('/sign-in', async (c) => {
	// 1. The session cookie's lowercase `sameSite`: Hono's is capitalised.
	// @ts-expect-error — 'lax' is not 'Lax' | 'Strict' | 'None'.
	const device = deviceOf(c, { sameSite: 'lax' });
	const signedIn = await auth.patient.signIn(
		{ email: '', password: '' },
		{ device },
	);
	// 2. The device cookie's options given at the top: they go under `device`.
	// @ts-expect-error — `name` is not an option of sendSession; `device: { name }` is.
	sendSession(c, auth, signedIn, { name: 'device' });

	// What must keep compiling: the same options, read and sent alike.
	const options = { name: 'device', maxAge: 60 } as const;
	sendSession(
		c,
		auth,
		await auth.patient.signIn(
			{ email: '', password: '' },
			{ device: deviceOf(c, options) },
		),
		{ device: options },
	);
	return c.body(null);
});
