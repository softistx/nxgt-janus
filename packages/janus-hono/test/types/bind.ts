/**
 * `bindJanus()` types what it binds as the unbound functions do: each
 * `@ts-expect-error` is a refusal the unbound form makes too.
 */

import { Hono } from 'hono';
import { bindJanus, byParam } from '../../src/index';
import { type MedicalRecord, setup } from '../app';

const { auth, access } = setup();
declare const find: (id: string) => Promise<MedicalRecord | null>;
const j = bindJanus({ auth, access });

new Hono()
	.get('/me', j.session({ required: true }), (c) => {
		const id: string = c.var.user.id;
		return c.json({ id });
	})
	.get('/who', j.session(), (c) => {
		// 1. Not required: the user may be null.
		// @ts-expect-error — `c.var.user` is possibly null.
		c.var.user.id;
		return c.body(null);
	})
	// 2. A user type the instance does not know.
	// @ts-expect-error — 'doctor' is neither 'patient' nor 'staff'.
	.get('/doctor', j.session({ type: 'doctor' }), (c) => c.body(null))
	.get(
		'/records/:id',
		j.permission('view', 'record', byParam('id', find)),
		(c) => {
			const title: string = c.var.object.title;
			return c.json({ title });
		},
	)
	.put(
		'/records/:id',
		// 3. edit reaches a condition: its ctx is required, as unbound.
		// @ts-expect-error — the options with `ctx` are missing.
		j.permission('edit', 'record', byParam('id', find)),
		(c) => c.body(null),
	)
	.get(
		'/records/:id/x',
		j.permission(
			// @ts-expect-error 4. — "veiw" is no permission of record.
			'veiw',
			'record',
			byParam('id', find),
		),
		(c) => c.body(null),
	);

// 5. Bound without access: there is no permission to call.
// @ts-expect-error — `permission` does not exist on an auth-only binding.
bindJanus({ auth }).permission;

// 6. Bound without auth: no session.
// @ts-expect-error — `session` does not exist on an access-only binding.
bindJanus({ access }).session;
