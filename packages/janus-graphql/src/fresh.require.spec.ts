import { describe, expect, it } from 'bun:test';
import type { Session } from '@nxgt/janus';
import { GraphQLError } from 'graphql';
import {
	ask,
	type Context,
	codes,
	server,
	setup,
	users,
} from '../test/harness';
import { requireFresh } from './fresh';

const typeDefs = /* GraphQL */ `
	type Query {
		signedInAt: String
	}
`;

const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Query: {
		signedInAt: async (_: unknown, __: unknown, ctx: Context) =>
			(await requireFresh(ctx, '10m')).authenticatedAt.toISOString(),
	},
};

async function wired() {
	const context = setup();
	const signedUp = await users(context);
	return {
		...context,
		...signedUp,
		yoga: server(context, typeDefs, resolvers),
	};
}

/** What `requireFresh` rejects with, settled where it is created. */
function rejection(promise: Promise<unknown>): Promise<unknown> {
	return promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(error: unknown) => error,
	);
}

describe('requireFresh(ctx, maxAge)', () => {
	it('answers the session, signed in less than maxAge ago', async () => {
		const { yoga, ada, clock } = await wired();
		clock.advance(599_999);
		const { body } = await ask(yoga, '{ signedInAt }', ada.token);
		expect(body).toEqual({
			data: { signedInAt: ada.session.authenticatedAt.toISOString() },
		});
	});

	it('answers a session maxAge old STEP_UP_REQUIRED, 403', async () => {
		const { yoga, ada, clock } = await wired();
		clock.advance(600_000);
		const { status, body } = await ask(yoga, '{ signedInAt }', ada.token);
		expect(status).toBe(403);
		expect(codes(body)).toEqual(['STEP_UP_REQUIRED']);
	});

	it('answers an anonymous request UNAUTHENTICATED, 401', async () => {
		const { yoga } = await wired();
		const { status, body } = await ask(yoga, '{ signedInAt }');
		expect(status).toBe(401);
		expect(codes(body)).toEqual(['UNAUTHENTICATED']);
	});

	it('reads the system clock in a context useJanus() did not build', async () => {
		const session = (authenticatedAt: Date) =>
			({ authenticatedAt, userId: 'u1' }) as Session;
		const byHand = (at: Date) => ({
			janus: { user: async () => null, session: async () => session(at) },
		});
		const recent = byHand(new Date());
		expect((await requireFresh(recent, '10m')).userId).toBe('u1');

		const old = new Date(Date.now() - 600_000);
		const stale = byHand(old);
		const error = await rejection(requireFresh(stale, '10m'));
		expect(error).toBeInstanceOf(GraphQLError);
		expect((error as GraphQLError).extensions).toMatchObject({
			code: 'STEP_UP_REQUIRED',
			http: { status: 403 },
		});
	});
});

describe('requireFresh(ctx, maxAge) refused as a wiring error', () => {
	const ctx = { janus: { user: async () => null, session: async () => null } };

	it('refuses a bare number, which @nxgt/janus would read as milliseconds', async () => {
		const error = await rejection(requireFresh(ctx, 600 as never));
		expect(error).toEqual(
			new TypeError(
				"requireFresh(): maxAge is a duration with its unit, such as '10m' — a bare number would be milliseconds, where @fresh reads seconds",
			),
		);
	});

	it('refuses a duration it cannot read, naming requireFresh()', async () => {
		const error = await rejection(requireFresh(ctx, '10 minutes' as never));
		expect(error).toBeInstanceOf(TypeError);
		expect((error as TypeError).message).toStartWith(
			'requireFresh(): maxAge: "10 minutes" is not a duration',
		);
	});

	it('refuses a context useJanus() did not build', async () => {
		const error = await rejection(requireFresh({} as never, '10m'));
		expect(error).toEqual(
			new TypeError(
				'requireFresh(): ctx.janus is not set — add useJanus({ auth }) to the plugins',
			),
		);
	});
});
