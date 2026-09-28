import { describe, expect, it } from 'bun:test';
import { type Setup, server, setup, users } from '../../test/harness';

const typeDefs = /* GraphQL */ `
	type Query {
		open: String
	}
	type Subscription {
		payments: Int @fresh(maxAge: 600)
		receipts: Receipt @authenticated
	}
	"A @fresh on the payload's type: its fields resolve on every event."
	type Receipt @fresh(maxAge: 600) {
		amount: Int
	}
`;

/** A stream of two events, whose clock moves past maxAge between them. */
function streaming(context: Setup) {
	const started = { count: 0 };
	async function* payments() {
		started.count++;
		yield { payments: 1 };
		context.clock.advance(3_600_000);
		yield { payments: 2 };
	}
	async function* receipts() {
		yield { receipts: { amount: 1 } };
		context.clock.advance(3_600_000);
		yield { receipts: { amount: 2 } };
	}
	const resolvers = {
		// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
		Subscription: {
			payments: { subscribe: payments },
			receipts: { subscribe: receipts },
		},
	};
	return { yoga: server(context, typeDefs, resolvers), started };
}

/** A subscription over server-sent events, which carry the request. */
async function subscribe(
	yoga: ReturnType<typeof server>,
	token?: string,
	query = 'subscription { payments }',
) {
	const response = await yoga.fetch('http://yoga.test/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'text/event-stream',
			...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
		},
		body: JSON.stringify({ query }),
	});
	return response.text();
}

describe('@fresh on a subscription', () => {
	it('refuses an older session before it subscribes', async () => {
		const context = setup();
		const { ada } = await users(context);
		const { yoga, started } = streaming(context);
		context.clock.advance(600_000);
		const text = await subscribe(yoga, ada.token);
		expect(started.count).toBe(0); // the source stream never started
		expect(text).toContain('"code":"STEP_UP_REQUIRED"');
		expect(text).not.toContain('"payments":1');
	});

	it('refuses an anonymous subscription UNAUTHENTICATED', async () => {
		const context = setup();
		const { yoga, started } = streaming(context);
		const text = await subscribe(yoga);
		expect(started.count).toBe(0);
		expect(text).toContain('"code":"UNAUTHENTICATED"');
	});

	it('is checked when it subscribes: a fresh subscription streams past maxAge', async () => {
		const context = setup();
		const { ada } = await users(context);
		const { yoga, started } = streaming(context);
		const text = await subscribe(yoga, ada.token);
		expect(started.count).toBe(1);
		expect(text).toContain('"payments":1');
		expect(text).toContain('"payments":2'); // an hour later, on the same stream
		expect(text).not.toContain('STEP_UP_REQUIRED');
	});

	it("checks a @fresh on the payload's type on every event, as any field", async () => {
		const context = setup();
		const { ada } = await users(context);
		const { yoga } = streaming(context);
		const text = await subscribe(
			yoga,
			ada.token,
			'subscription { receipts { amount } }',
		);
		expect(text).toContain('"amount":1');
		expect(text).not.toContain('"amount":2'); // an hour later: refused
		expect(text).toContain('"code":"STEP_UP_REQUIRED"');
	});
});
