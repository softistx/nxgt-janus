import { describe, expect, it } from 'bun:test';
import { createSchema, createYoga } from 'graphql-yoga';
import { ask, codes, type Setup, setup, users } from '../test/harness';
import { janusMaskError } from './errors';
import { useJanus } from './plugin';
import { janusTypeDefs } from './sdl';

const typeDefs = /* GraphQL */ `
	type Query {
		email: String @fresh(maxAge: 600)
	}
`;

// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
const resolvers = { Query: { email: () => 'ada@example.test' } };

/** A server whose `useJanus()` is given `janus()`'s clock, or none. */
function yogaOf(context: Setup, withClock: boolean) {
	const { auth, clock } = context;
	return createYoga({
		schema: createSchema({ typeDefs: [janusTypeDefs, typeDefs], resolvers }),
		plugins: [withClock ? useJanus({ auth, clock }) : useJanus({ auth })],
		maskedErrors: { maskError: janusMaskError() },
		logging: false,
	});
}

describe('useJanus({ clock })', () => {
	it('is the clock @fresh reads the time from', async () => {
		const context = setup();
		const { ada } = await users(context);
		const yoga = yogaOf(context, true);
		expect((await ask(yoga, '{ email }', ada.token)).body).toEqual({
			data: { email: 'ada@example.test' },
		});
	});

	it("is the system's without one: a session signed in on janus()'s fixed clock, days ago", async () => {
		const context = setup(); // janus() runs on a clock fixed at 2026-09-24
		const { ada } = await users(context);
		const yoga = yogaOf(context, false);
		const { status, body } = await ask(yoga, '{ email }', ada.token);
		expect(status).toBe(403);
		expect(codes(body)).toEqual(['STEP_UP_REQUIRED']);
	});

	it('refuses a clock with no now()', () => {
		const { auth } = setup();
		expect(() => useJanus({ auth, clock: { time: 0 } as never })).toThrow(
			new TypeError(
				'useJanus(): clock is not a Clock — pass the clock given to janus(), or leave it out for the system clock',
			),
		);
	});
});
