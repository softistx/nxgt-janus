/**
 * What the compiler refuses, measured: each `@ts-expect-error` below is a
 * plausible mistake, and fails the typecheck the day it compiles.
 */

import type { YogaInitialContext } from 'graphql-yoga';
import type { JanusContext } from '../../src/index';
import { setup } from '../harness';

const { auth, access } = setup();

type Ctx = YogaInitialContext & JanusContext<typeof auth, typeof access>;
type StaffCtx = JanusContext<typeof auth, typeof access, 'staff'>;
type NoAccess = JanusContext<typeof auth>;

export async function resolvers(ctx: Ctx, staff: StaffCtx, bare: NoAccess) {
	const user = await ctx.janus.user();
	// 1. An anonymous request reaches a resolver: the user may be null.
	// @ts-expect-error — `user` is possibly null.
	user.id;
	const type: 'patient' | 'staff' | undefined = user?.type;

	// The session is typed, and nullable too.
	const expires: Date | undefined = (await ctx.janus.session())?.expiresAt;
	// 2. The same null, on the session.
	// @ts-expect-error — the session is possibly null.
	(await ctx.janus.session()).expiresAt;

	// Narrowed by useJanus({ type: 'staff' }): a staff member has a username.
	const username: string | undefined = (await staff.janus.user())?.username;
	// 3. A field of another user type.
	// @ts-expect-error — staff have no e-mail.
	(await staff.janus.user())?.email;

	// `access` is the permissions() instance given to useJanus().
	await ctx.janus.access.grant({ type: 'record', id: 'r1' }, 'owners', {
		type: 'patient',
		id: 'u1',
	});
	// 4. `access` read where useJanus() was not given one.
	// @ts-expect-error — no `access` without useJanus({ access }).
	bare.janus.access;

	return { type, expires, username };
}

// 5. A context narrowed to a user type the instance does not know.
// @ts-expect-error — 'doctor' is not a user type of `auth`.
export type Unknown = JanusContext<typeof auth, typeof access, 'doctor'>;
