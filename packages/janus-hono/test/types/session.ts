/**
 * What the compiler refuses, measured: each `@ts-expect-error` below is a
 * plausible mistake, and fails the typecheck the day it compiles.
 */

import { Hono } from 'hono';
import { type SessionEnv, sendSession, session } from '../../src/index';
import { setup } from '../app';

const { auth } = setup();

new Hono()
	.get('/who', session(auth), (c) => {
		// 1. An anonymous request reaches a route that does not require a user.
		// @ts-expect-error — `c.var.user` is possibly null.
		c.var.user.id;
		return c.body(null);
	})
	.get('/me', session(auth, { required: true }), (c) => {
		const id: string = c.var.user.id;
		const expires: Date = c.var.session.expiresAt;
		return c.json({ id, expires });
	})
	.get('/staff', session(auth, { type: 'staff', required: true }), (c) => {
		const username: string = c.var.user.username;
		// 2. A field of another user type.
		// @ts-expect-error — staff have no e-mail.
		c.var.user.email;
		return c.json({ username });
	})
	// 3. A user type the instance does not know.
	// @ts-expect-error — 'doctor' is neither 'patient' nor 'staff'.
	.get('/doctor', session(auth, { type: 'doctor' }), (c) => c.body(null))
	.post('/sign-in', async (c) => {
		const signedIn = await auth.patient.signIn({ email: '', password: '' });
		sendSession(c, auth, signedIn);
		// 4. A cookie without the session that dates it.
		// @ts-expect-error — `session` is missing.
		sendSession(c, auth, { token: signedIn.token });
		return c.body(null);
	});

// Typed once for an app that wires `app.use(session(auth))`.
new Hono<SessionEnv<typeof auth>>().use(session(auth)).get('/', (c) => {
	const type: 'patient' | 'staff' | undefined = c.var.user?.type;
	// 5. The same null, through `SessionEnv`.
	// @ts-expect-error — `c.var.session` is possibly null.
	c.var.session.id;
	return c.json({ type });
});

// 6. `SessionEnv` narrowed to a type the instance does not know.
// @ts-expect-error — 'doctor' is not a user type of `auth`.
export type Unknown = SessionEnv<typeof auth, 'doctor'>;
