/**
 * What the compiler refuses in `permission()` and `provide()`, measured: each
 * `@ts-expect-error` below is a plausible mistake, and fails the typecheck the
 * day it compiles.
 */

import {
	createMemoryRelations,
	defineModel,
	permissions,
	when,
} from '@nxgt/janus/permissions';
import { Hono } from 'hono';
import { byParam, permission, provide, session } from '../../src/index';
import { type MedicalRecord, setup } from '../app';

const { auth, access } = setup();
declare const find: (id: string | undefined) => Promise<MedicalRecord | null>;

new Hono()
	.use(session(auth))
	.get(
		'/records/:id',
		permission(access, 'view', 'record', (c) => find(c.req.param('id'))),
		(c) => {
			const title: string = c.var.object.title;
			// 7. A field the loaded object does not have.
			// @ts-expect-error — a MedicalRecord has no `owner`.
			c.var.object.owner;
			return c.json({ title });
		},
	)
	.put(
		'/records/:id',
		permission(access, 'edit', 'record', (c) => find(c.req.param('id')), {
			ctx: (c) => ({ locked: c.req.header('x-locked') === 'yes' }),
		}),
		(c) => c.body(null),
	);

// 8. A permission the object type does not declare — reported on itself.
permission(
	access,
	// @ts-expect-error — 'delete' is neither a relation nor a permission of record.
	'delete',
	'record',
	(c) => find(c.req.param('id')),
);

// 9. An object type the model does not declare.
// @ts-expect-error — 'folder' is not an object type.
permission(access, 'view', 'folder', (c) => find(c.req.param('id')));

// 10. An object loaded without a field a `fromField` reads: a silent denial
// at run time, a compile error here.
// @ts-expect-error — `doctorId` is missing.
permission(access, 'view', 'record', () => ({ id: 'r1' }));

// 11. A condition reached with no context.
// @ts-expect-error — `edit` reaches `when(…)`: `ctx` is required.
permission(access, 'edit', 'record', (c) => find(c.req.param('id')));

permission(access, 'edit', 'record', (c) => find(c.req.param('id')), {
	// 12. A context of the wrong shape.
	// @ts-expect-error — `locked` is a boolean.
	ctx: () => ({ locked: 'no' }),
});

permission(access, 'view', 'record', (c) => find(c.req.param('id')), {
	// 13. A context where no condition is reachable.
	// @ts-expect-error — `view` has no condition.
	ctx: () => ({ locked: false }),
});

new Hono().post(
	'/records',
	session(auth, { type: 'patient', required: true }),
	provide({ access }),
	async (c) => {
		await c.var.access.grant({ type: 'record', id: 'r2' }, 'owner', c.var.user);
		const record = { type: 'record', id: 'r2' } as const;
		// 14. A relation read from a field: nothing to grant.
		// @ts-expect-error — `doctor` is a fromField.
		await c.var.access.grant(record, 'doctor', c.var.user);
		// 15. An instance that was not provided.
		// @ts-expect-error — only `access` was given to provide().
		c.var.auth;
		return c.body(null, 201);
	},
);

// A model of several object types, one of them reached through a condition.
const folders = permissions({
	model: defineModel({
		subjects: auth.types,
		types: {
			folder: {
				relations: { owner: ['patient'] },
				permissions: {
					open: [when('owner', (ctx: { unlocked: boolean }) => ctx.unlocked)],
				},
			},
			record: {
				relations: { parent: ['folder'] },
				permissions: { view: ['parent->open'] },
			},
		},
	}),
	store: createMemoryRelations(),
});
declare const record: { id: string; parent: string };

permission(folders, 'view', 'record', () => record, {
	ctx: () => ({ unlocked: true }), // reached through the arrow
});

// 16. A misspelled object type, reported on itself — not as a missing `ctx`,
// which would land on the call's first line and leave this directive unused.
permission(
	folders,
	'view',
	// @ts-expect-error — 'folderz' is not an object type.
	'folderz',
	() => record,
);

// byParam keeps the loaded type: the route reads a field of its record.
new Hono().get(
	'/records/:id',
	session(auth),
	permission(access, 'view', 'record', byParam('id', find)),
	(c) => {
		const title: string = c.var.object.title;
		return c.json({ title });
	},
);
