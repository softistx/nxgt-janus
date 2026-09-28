import { describe, expect, it } from 'bun:test';
import {
	ask,
	type Context,
	codes,
	server,
	setup,
	users,
} from '../test/harness';
import { can, requireUser } from './helpers';

const typeDefs = /* GraphQL */ `
	type Query {
		guarded: String @authenticated
		staffOnly: String @authenticated(type: ["staff"])
		required: String
		who: String
		record: String
	}
`;

const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Query: {
		guarded: () => 'guarded',
		staffOnly: () => 'staff',
		required: async (_: unknown, __: unknown, ctx: Context) =>
			(await requireUser(ctx)).id,
		who: async (_: unknown, __: unknown, ctx: Context) =>
			(await ctx.janus.user())?.id ?? 'anonymous',
		record: async (_: unknown, __: unknown, ctx: Context) =>
			(await can(ctx, 'view', { type: 'record', id: 'r1', doctorId: null }))
				? 'Blood test'
				: null,
	},
};

async function down(options: { readonly masked?: boolean } = {}) {
	const context = setup();
	const { ada } = await users(context);
	context.outage.sessions = true;
	return { yoga: server(context, typeDefs, resolvers, options), ada };
}

describe('a store that throws StoreFailure', () => {
	for (const field of ['guarded', 'staffOnly', 'required', 'who']) {
		it(`answers ${field} SERVICE_UNAVAILABLE, 503 — never 401 or 403`, async () => {
			const { yoga, ada } = await down();
			const { status, body } = await ask(yoga, `{ ${field} }`, ada.token);
			expect(status).toBe(503);
			expect(codes(body)).toEqual(['SERVICE_UNAVAILABLE']);
			expect(body.errors?.[0]?.message).toBe(
				'The service is unavailable, retry later',
			);
		});
	}

	it("answers can()'s outage 503, never a denial", async () => {
		const context = setup();
		const { ada } = await users(context);
		const yoga = server(context, typeDefs, resolvers);
		await context.access.grant(
			{ type: 'record', id: 'r1' },
			'owners',
			ada.user,
		);
		const { body: before } = await ask(yoga, '{ record }', ada.token);
		expect(before.data).toEqual({ record: 'Blood test' });

		// The sessions store answers; only the relation store is down.
		context.outage.relations = true;
		const { status, body } = await ask(yoga, '{ record }');
		expect(status).toBe(200);
		expect(body.data).toEqual({ record: null }); // anonymous: no store call

		const signedIn = await ask(yoga, '{ record }', ada.token);
		expect(signedIn.status).toBe(503);
		expect(codes(signedIn.body)).toEqual(['SERVICE_UNAVAILABLE']);
	});

	for (const field of ['guarded', 'required']) {
		it(`answers ${field} 503 without janusMaskError() too`, async () => {
			const { yoga, ada } = await down({ masked: false });
			const { status, body } = await ask(yoga, `{ ${field} }`, ada.token);
			expect(status).toBe(503);
			expect(codes(body)).toEqual(['SERVICE_UNAVAILABLE']);
		});
	}
});
