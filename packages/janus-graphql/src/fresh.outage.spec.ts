import { describe, expect, it } from 'bun:test';
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
		email: String @fresh(maxAge: 600)
		card: String
	}
`;

const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Query: {
		email: () => 'ada@example.test',
		card: async (_: unknown, __: unknown, ctx: Context) => {
			await requireFresh(ctx, '10m');
			return '4242';
		},
	},
};

async function down(options: { readonly masked?: boolean } = {}) {
	const context = setup();
	const { ada } = await users(context);
	// Past maxAge too: an outage is answered before freshness is read.
	context.clock.advance(3_600_000);
	context.outage.sessions = true;
	return { yoga: server(context, typeDefs, resolvers, options), ada };
}

describe('freshness over a store that throws StoreFailure', () => {
	for (const field of ['email', 'card']) {
		for (const masked of [true, false]) {
			it(`answers ${field} SERVICE_UNAVAILABLE, 503 — never 401 or STEP_UP_REQUIRED${masked ? '' : ', without janusMaskError()'}`, async () => {
				const { yoga, ada } = await down({ masked });
				const { status, body } = await ask(yoga, `{ ${field} }`, ada.token);
				expect(status).toBe(503);
				expect(codes(body)).toEqual(['SERVICE_UNAVAILABLE']);
				expect(body.errors?.[0]?.message).toBe(
					'The service is unavailable, retry later',
				);
			});
		}
	}
});
