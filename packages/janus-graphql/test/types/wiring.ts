/**
 * What the compiler refuses in `@permission`'s wiring, measured: each
 * `@ts-expect-error` below is a plausible mistake, and fails the typecheck
 * the day it compiles. The first block must keep compiling.
 */

import type { YogaInitialContext } from 'graphql-yoga';
import { type JanusContext, useJanus } from '../../src/index';
import { setup } from '../harness';

const { auth, access } = setup();

type Context = YogaInitialContext & JanusContext<typeof auth, typeof access>;

declare const records: {
	find(id: string): Promise<{ id: string; doctorId: string | null } | null>;
};

// A loader and a condition, each reading the application's whole context.
export const wired = useJanus({
	auth,
	access,
	loaders: {
		record: (id, ctx: Context) => {
			ctx.request.headers.get('x-trace');
			return records.find(id);
		},
		ward: (id) => ({ id }),
	},
	conditions: {
		record: (object, ctx: Context) => ({
			locked: object.doctorId === null && ctx.params.query === undefined,
		}),
	},
});

// 19. A loader for an object type the model does not declare.
useJanus({
	auth,
	access,
	// @ts-expect-error — 'invoice' is not an object type of the model.
	loaders: { invoice: (id: string) => ({ id }) },
});

// 20. A loader answering an object without the field a `fromField` reads.
useJanus({
	auth,
	access,
	// @ts-expect-error — `doctorId` is missing: `doctors` reads it.
	loaders: { record: (id: string) => ({ id }) },
});

// 21. A condition for a type whose permissions reach no when().
useJanus({
	auth,
	access,
	// @ts-expect-error — no permission of 'ward' reaches a condition.
	conditions: { ward: () => ({ locked: false }) },
});

// 22. A condition answering a `ctx` of the wrong shape.
useJanus({
	auth,
	access,
	// @ts-expect-error — `locked` is a boolean.
	conditions: { record: () => ({ locked: 'yes' }) },
});

// 23. Loaders where useJanus() was given no `access`.
// @ts-expect-error — without access, @permission has nothing to load for.
useJanus({ auth, loaders: { record: () => null } });
