/**
 * What the compiler refuses, measured: each `@ts-expect-error` below is a
 * plausible mistake, and fails the typecheck the day it compiles. The
 * numbering runs on from `wiring.ts`.
 */

import { fixedClock, type Session } from '@nxgt/janus';
import { type JanusContext, requireFresh, useJanus } from '../../src/index';
import { setup } from '../harness';

const { auth, access, clock } = setup();

type Ctx = JanusContext<typeof auth, typeof access>;

export async function freshness(ctx: Ctx) {
	// Never null: an anonymous request was refused.
	const session: Session = await requireFresh(ctx, '10m');
	await requireFresh(ctx, '600s');

	// 25. A bare number, which @nxgt/janus reads as milliseconds and @fresh as seconds.
	// @ts-expect-error — write the unit: '10m'.
	await requireFresh(ctx, 600);

	// 26. A duration written as prose.
	// @ts-expect-error — '10 minutes' is not a duration: '10m'.
	await requireFresh(ctx, '10 minutes');

	// 27. No maxAge at all.
	// @ts-expect-error — how recent the proof must be is required.
	await requireFresh(ctx);

	// 28. The request instead of the context.
	// @ts-expect-error — `janus` is missing: pass the resolver's ctx.
	await requireFresh({ headers: new Headers() }, '10m');

	return session;
}

// The clock given to janus(), or a fixed one in a spec.
export const clocked = useJanus({ auth, clock });
export const fixed = useJanus({ auth, clock: fixedClock(0) });

// 29. A clock that is not a Clock: a timestamp.
// @ts-expect-error — `clock` answers `now()`: pass the clock given to janus().
useJanus({ auth, clock: Date.now() });
