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

// 7. Nor sendSession, nor signOut.
// @ts-expect-error — `sendSession` does not exist on an access-only binding.
bindJanus({ access }).sendSession;
// @ts-expect-error 8. — `signOut` does not exist on an access-only binding.
bindJanus({ access }).signOut;

// 9. Something that is not a permissions() instance.
// @ts-expect-error — `{}` has no `can`.
bindJanus({ access: {} });

// Must keep compiling: the narrow `access` permission() takes, the ctx
// option, a staff-only route, and a computed `required` staying nullable.
const narrow: Pick<typeof access, 'can'> = access;
bindJanus({ access: narrow }).permission('view', 'record', byParam('id', find));
declare const flag: boolean;
new Hono()
	.put(
		'/records/:id',
		j.permission('edit', 'record', byParam('id', find), {
			ctx: () => ({ locked: false }),
		}),
		(c) => c.body(null),
	)
	.get('/rota', j.session({ type: 'staff', required: true }), (c) => {
		const type: 'staff' = c.var.user.type;
		return c.json({ type });
	})
	.get('/maybe', j.session({ required: flag }), (c) => {
		const user: { readonly id: string } | null = c.var.user;
		return c.json({ signedIn: user !== null });
	});
