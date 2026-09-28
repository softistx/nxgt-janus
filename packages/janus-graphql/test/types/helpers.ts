/**
 * What the compiler refuses, measured: each `@ts-expect-error` below is a
 * plausible mistake, and fails the typecheck the day it compiles.
 */

import { can, type JanusContext, requireUser } from '../../src/index';
import { setup } from '../harness';

const { auth, access } = setup();

type Ctx = JanusContext<typeof auth, typeof access>;
type NoAccess = JanusContext<typeof auth>;

const record = { type: 'record', id: 'r1', doctorId: null } as const;

export async function narrowing(ctx: Ctx) {
	// Never null: an anonymous request was refused.
	const id: string = (await requireUser(ctx)).id;

	const staff = await requireUser(ctx, { type: 'staff' });
	const username: string = staff.username;
	// 6. A field of another user type, once narrowed.
	// @ts-expect-error — staff have no e-mail.
	staff.email;

	// Several types: the union of them.
	const either = await requireUser(ctx, { type: ['staff', 'patient'] });
	const type: 'staff' | 'patient' = either.type;

	// 7. A user type the instance does not know.
	// @ts-expect-error — 'doctor' is neither 'patient' nor 'staff'.
	await requireUser(ctx, { type: 'doctor' });

	return { id, username, type };
}

export async function checking(ctx: Ctx, bare: NoAccess) {
	const viewed: boolean = await can(ctx, 'view', record);
	await can(ctx, 'edit', record, { ctx: { locked: false } });

	// 8. A permission the object's type does not declare.
	// @ts-expect-error — 'delete' is not a permission of 'record'.
	await can(ctx, 'delete', record);

	// 9. An object type the model does not declare.
	// @ts-expect-error — 'invoice' is not an object type of the model.
	await can(ctx, 'view', { type: 'invoice', id: 'i1' });

	// 10. An object without the field a `fromField` reads.
	// @ts-expect-error — `doctorId` is missing: `doctors` reads it.
	await can(ctx, 'view', { type: 'record', id: 'r1' });

	// 11. A condition reached with no `ctx`.
	// @ts-expect-error — `edit` reaches a when(): `{ ctx }` is required.
	await can(ctx, 'edit', record);

	// 12. A `ctx` of the wrong shape.
	// @ts-expect-error — `locked` is a boolean.
	await can(ctx, 'edit', record, { ctx: { locked: 'yes' } });

	// 13. A context whose useJanus() was given no `access`.
	// @ts-expect-error — `ctx.janus.access` is missing.
	await can(bare, 'view', record);

	return viewed;
}
