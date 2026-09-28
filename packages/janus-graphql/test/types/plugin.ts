/**
 * What the compiler refuses, measured: each `@ts-expect-error` below is a
 * plausible mistake, and fails the typecheck the day it compiles. The first
 * block is the README's quick start, which must keep compiling.
 */

import { useMaskedErrors } from '@envelop/core';
import {
	createSchema,
	createYoga,
	maskError,
	type YogaInitialContext,
} from 'graphql-yoga';
import {
	applyJanusDirectives,
	type JanusContext,
	janusMaskError,
	janusTypeDefs,
	requireUser,
	useJanus,
} from '../../src/index';
import { setup } from '../harness';

const { auth, access } = setup();

// The README's quick start, as it is written there.
type Context = YogaInitialContext & JanusContext<typeof auth, typeof access>;

declare const wards: {
	find(
		id: string,
		staffId: string,
	): Promise<{ id: string; name: string } | null>;
};

const typeDefs = /* GraphQL */ `
	type Query {
		me: User @authenticated
		ward(id: ID!): Ward
	}
	type User { id: ID!, email: String }
	type Ward @authenticated(type: ["staff"]) { id: ID!, name: String }
`;

export const yoga = createYoga({
	schema: createSchema({
		typeDefs: [janusTypeDefs, typeDefs],
		resolvers: {
			Query: {
				me: async (_: unknown, __: unknown, ctx: Context) => ctx.janus.user(), // never null here
				ward: async (_: unknown, { id }: { id: string }, ctx: Context) => {
					const staff = await requireUser(ctx, { type: 'staff' }); // typed: a staff member
					return wards.find(id, staff.id);
				},
			},
		},
	}),
	plugins: [useJanus({ auth, access })],
	maskedErrors: { maskError: janusMaskError() }, // STORE_FAILED → 503, not "Unexpected error."
});

// The mask takes Yoga's own as its fallback, and fits envelop's plugin too.
export const withYogas = createYoga({
	schema: yoga.getEnveloped().schema,
	maskedErrors: { maskError: janusMaskError(maskError) },
});
export const masking = useMaskedErrors({ maskError: janusMaskError() });

// One user type only: any other is anonymous.
export const staffOnly = useJanus({ auth, type: 'staff' });

// 14. A user type the instance does not know.
// @ts-expect-error — 'doctor' is neither 'patient' nor 'staff'.
useJanus({ auth, type: 'doctor' });

// 15. Something that is not what janus() answered.
// @ts-expect-error — `authenticate` and `types` are missing.
useJanus({ auth: { name: 'janus' } });

// 16. The permissions() instance passed as `auth`.
// @ts-expect-error — `access` is not `auth`.
useJanus({ auth: access });

// 17. The transform without the instance whose user types it checks.
// @ts-expect-error — `auth` is required.
applyJanusDirectives(yoga.getEnveloped().schema, {});

// 18. The transform narrowed to a user type the instance does not know.
// @ts-expect-error — 'doctor' is neither 'patient' nor 'staff'.
applyJanusDirectives(yoga.getEnveloped().schema, { auth, type: 'doctor' });
