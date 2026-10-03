// Every middleware an app is made of, behind exported values whose types are
// inferred: a declaration build must be able to name each one through
// `@nxgt/janus-hono`, `@nxgt/janus` and `hono` alone (TS2883 otherwise).
import {
	createMemoryStores,
	janus,
	type StandardSchemaV1,
	scryptHasher,
} from '@nxgt/janus';
import {
	createMemoryRelations,
	defineModel,
	fromField,
	permissions,
	when,
} from '@nxgt/janus/permissions';
import {
	bindJanus,
	byParam,
	deviceOf,
	fresh,
	janusErrors,
	permission,
	provide,
	sendSession,
	session,
	signOut,
} from '@nxgt/janus-hono';
import { Hono } from 'hono';

/** A Standard Schema that takes its value at its word: no validator needed. */
function schema<T>(): StandardSchemaV1<T, T> {
	return {
		'~standard': {
			version: 1,
			vendor: 'fixture',
			validate: (value) => ({ value: value as T }),
		},
	};
}

export const auth = janus({
	users: {
		patient: {
			schema: schema<{ email: string; name: string }>(),
			password: { login: 'email' },
			session: { lifespan: '7d', renewAfter: '1d' },
		},
		staff: {
			schema: schema<{ username: string }>(),
			password: { login: 'username' },
		},
	},
	store: createMemoryStores(),
	hasher: scryptHasher({ cost: 10 }),
});

export const access = permissions({
	model: defineModel({
		subjects: auth.types,
		types: {
			record: {
				related: {
					owners: ['patient'],
					doctors: fromField('doctorId', 'staff'),
				},
				permits: {
					view: ['owners', 'doctors'],
					edit: [when('owners', (ctx: { locked: boolean }) => !ctx.locked)],
				},
			},
		},
	}),
	store: createMemoryRelations(),
});

type MedicalRecord = { id: string; doctorId: string | null; title: string };
declare const find: (id: string) => Promise<MedicalRecord | null>;

export const app = new Hono()
	.use(session(auth), provide({ auth, access }))
	.post('/sign-in', async (c) => {
		const signedIn = await auth.patient.signIn(
			{ email: 'ada@example.test', password: 'pw' },
			{ device: deviceOf(c) },
		);
		return c.json({ id: sendSession(c, auth, signedIn).id });
	})
	.post('/sign-out', async (c) => {
		await signOut(c, auth);
		return c.body(null, 204);
	})
	.get('/me', session(auth, { required: true }), (c) =>
		c.json({ id: c.var.user.id }),
	)
	.delete('/account', session(auth, { required: true }), fresh('10m'), (c) =>
		c.body(null, 204),
	)
	.get(
		'/records/:id',
		permission(access, 'view', 'record', byParam('id', find)),
		(c) => c.json({ title: c.var.object.title }),
	);

app.onError(janusErrors());

export const j = bindJanus({ auth, access });

export const bound = new Hono()
	.get('/me', j.session({ required: true }), (c) =>
		c.json({ id: c.var.user.id }),
	)
	.get(
		'/records/:id',
		j.permission('view', 'record', byParam('id', find)),
		(c) => c.json({ title: c.var.object.title }),
	);

export const requireStaff = session(auth, { type: 'staff', required: true });

export const errors = janusErrors({ report: () => undefined });
