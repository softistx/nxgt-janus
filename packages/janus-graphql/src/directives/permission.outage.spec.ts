import { describe, expect, it } from 'bun:test';
import { StoreFailure } from '@nxgt/janus';
import { ask, codes } from '../../test/harness';
import { wards, wired } from './permission.fixtures';

const typeDefs = /* GraphQL */ `
	type Query {
		ward(id: ID!): String @permission(name: "enter", type: "ward")
		record(id: ID!): String @permission(name: "view", type: "record")
	}
`;

async function setUp(options: { readonly masked?: boolean } = {}) {
	const loader = { down: false };
	const w = await wired(
		typeDefs,
		{
			// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
			Query: {
				ward: (_: unknown, { id }: { id: string }) => id,
				record: (_: unknown, { id }: { id: string }) => id,
			},
		},
		{
			...options,
			loaders: {
				record: (id) => {
					if (loader.down) throw new StoreFailure('connection refused');
					return { id, doctorId: null };
				},
			},
		},
	);
	await wards(w);
	return { ...w, loader };
}

const unavailable = 'The service is unavailable, retry later';

describe('@permission when a store cannot answer', () => {
	it('answers the relation store down SERVICE_UNAVAILABLE, 503 — never NOT_FOUND', async () => {
		const { yoga, ada, outage } = await setUp();
		outage.relations = true;
		const { status, body } = await ask(yoga, '{ ward(id: "w1") }', ada.token);
		expect(status).toBe(503);
		expect(codes(body)).toEqual(['SERVICE_UNAVAILABLE']);
		expect(body.errors?.[0]?.message).toBe(unavailable);
	});

	it('answers the sessions store down 503 — never UNAUTHENTICATED', async () => {
		const { yoga, ada, outage, asked } = await setUp();
		outage.sessions = true;
		const { status, body } = await ask(yoga, '{ ward(id: "w1") }', ada.token);
		expect(status).toBe(503);
		expect(codes(body)).toEqual(['SERVICE_UNAVAILABLE']);
		expect(asked.can).toBe(0);
	});

	it('answers a loader throwing StoreFailure 503 — never NOT_FOUND', async () => {
		const { yoga, grace, loader } = await setUp();
		loader.down = true;
		const { status, body } = await ask(
			yoga,
			'{ record(id: "r1") }',
			grace.token,
		);
		expect(status).toBe(503);
		expect(codes(body)).toEqual(['SERVICE_UNAVAILABLE']);
	});

	it('answers 503 without janusMaskError() too', async () => {
		const { yoga, ada, outage } = await setUp({ masked: false });
		outage.relations = true;
		const { status, body } = await ask(yoga, '{ ward(id: "w1") }', ada.token);
		expect(status).toBe(503);
		expect(codes(body)).toEqual(['SERVICE_UNAVAILABLE']);
	});

	it('answers again once the store is back, in the same server', async () => {
		const { yoga, ada, outage } = await setUp();
		outage.relations = true;
		expect((await ask(yoga, '{ ward(id: "w1") }', ada.token)).status).toBe(503);
		outage.relations = false;
		const { body } = await ask(yoga, '{ ward(id: "w1") }', ada.token);
		expect(body).toEqual({ data: { ward: 'w1' } });
	});
});
