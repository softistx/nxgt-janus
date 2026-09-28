import { describe, expect, it } from 'bun:test';
import { server, setup, users } from '../../test/harness';

const typeDefs = /* GraphQL */ `
	type Query {
		open: String
	}
	type Subscription {
		ticks: Int @authenticated
	}
`;

const started = { count: 0 };

async function* count() {
	started.count++;
	yield { ticks: 1 };
	yield { ticks: 2 };
}

const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Subscription: { ticks: { subscribe: count } },
};

/** A subscription over server-sent events, which carry the request. */
async function subscribe(yoga: ReturnType<typeof server>, token?: string) {
	const response = await yoga.fetch('http://yoga.test/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'text/event-stream',
			...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
		},
		body: JSON.stringify({ query: 'subscription { ticks }' }),
	});
	return { status: response.status, text: await response.text() };
}

describe('@authenticated on a subscription', () => {
	it('refuses an anonymous subscription before it subscribes', async () => {
		const context = setup();
		started.count = 0;
		const { text } = await subscribe(server(context, typeDefs, resolvers));
		expect(started.count).toBe(0); // the source stream never started
		expect(text).toContain('"code":"UNAUTHENTICATED"');
		expect(text).not.toContain('"ticks":1');
	});

	it('streams to a signed-in user', async () => {
		const context = setup();
		const { ada } = await users(context);
		const { text } = await subscribe(
			server(context, typeDefs, resolvers),
			ada.token,
		);
		expect(text).toContain('"ticks":1');
		expect(text).toContain('"ticks":2');
	});
});
