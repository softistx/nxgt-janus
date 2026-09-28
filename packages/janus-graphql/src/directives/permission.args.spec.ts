import { describe, expect, it } from 'bun:test';
import { ask, codes } from '../../test/harness';
import { wards, wired } from './permission.fixtures';

const typeDefs = /* GraphQL */ `
	type Query {
		ward(id: ID!): String @permission(name: "enter", type: "ward")
		wardOf(input: WardInput!): String
			@permission(name: "enter", type: "ward", id: "args.input.wardId")
		record(id: ID!): Record @permission(name: "view", type: "record")
	}
	input WardInput {
		wardId: ID!
	}
	type Record {
		id: ID!
		title: String
	}
`;

type Row = { id: string; doctorId: string | null; title: string };

async function setUp() {
	const ran: string[] = [];
	const rows = new Map<string, Row>();
	const loaded: { id: string; hasJanus: boolean }[] = [];
	const resolvers = {
		// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
		Query: {
			ward: (_: unknown, { id }: { id: string }) => {
				ran.push('ward');
				return id;
			},
			wardOf: (_: unknown, { input }: { input: { wardId: string } }) =>
				input.wardId,
			record: (_: unknown, { id }: { id: string }) => rows.get(id) ?? null,
		},
	};
	const w = await wired(typeDefs, resolvers, {
		loaders: {
			record: (id, ctx) => {
				loaded.push({
					id,
					hasJanus: typeof (ctx as { janus?: unknown }).janus === 'object',
				});
				return rows.get(id) ?? null;
			},
		},
	});
	await wards(w);
	rows.set('r1', { id: 'r1', doctorId: w.grace.user.id, title: 'Blood test' });
	return { ...w, ran, loaded };
}

describe('@permission reading args', () => {
	it('lets through a user holding the permission on the object args.id names', async () => {
		const { yoga, ada, ran } = await setUp();
		const { status, body } = await ask(yoga, '{ ward(id: "w1") }', ada.token);
		expect(status).toBe(200);
		expect(body).toEqual({ data: { ward: 'w1' } });
		expect(ran).toEqual(['ward']);
	});

	it('answers any other user NOT_FOUND, 404, and never runs the resolver', async () => {
		const { yoga, ada, ran } = await setUp();
		const { status, body } = await ask(yoga, '{ ward(id: "w2") }', ada.token);
		expect(status).toBe(404);
		expect(codes(body)).toEqual(['NOT_FOUND']);
		expect(body.errors?.[0]?.message).toBe('Not found');
		expect(ran).toEqual([]);
	});

	it('answers an anonymous request UNAUTHENTICATED before asking or loading anything', async () => {
		const { yoga, asked, loaded } = await setUp();
		const ward = await ask(yoga, '{ ward(id: "w1") }');
		const record = await ask(yoga, '{ record(id: "r1") { title } }');
		expect(codes(ward.body)).toEqual(['UNAUTHENTICATED']);
		expect(record.status).toBe(401);
		expect(asked.can).toBe(0);
		expect(loaded).toEqual([]);
	});

	it('reads a path into an input object', async () => {
		const { yoga, ada } = await setUp();
		const allowed = await ask(
			yoga,
			'{ wardOf(input: { wardId: "w1" }) }',
			ada.token,
		);
		expect(allowed.body).toEqual({ data: { wardOf: 'w1' } });
		const denied = await ask(
			yoga,
			'{ wardOf(input: { wardId: "w2" }) }',
			ada.token,
		);
		expect(codes(denied.body)).toEqual(['NOT_FOUND']);
	});

	it('reads a variable as it reads a literal', async () => {
		const { yoga, ada } = await setUp();
		const { body } = await ask(
			yoga,
			'query ($id: ID!) { ward(id: $id) }',
			ada.token,
			{ id: 'w1' },
		);
		expect(body).toEqual({ data: { ward: 'w1' } });
	});
});

describe('@permission reading args, on a type with a fromField', () => {
	it('checks the object its loader answers, whose fields the fromField reads', async () => {
		const { yoga, grace, loaded } = await setUp();
		// Grace holds no tuple on r1: she is its doctor, read from doctorId.
		const { body } = await ask(
			yoga,
			'{ record(id: "r1") { title } }',
			grace.token,
		);
		expect(body).toEqual({ data: { record: { title: 'Blood test' } } });
		expect(loaded).toEqual([{ id: 'r1', hasJanus: true }]);
	});

	it('answers NOT_FOUND for a user the object does not name', async () => {
		const { yoga, ada } = await setUp();
		const { status, body } = await ask(
			yoga,
			'{ record(id: "r1") { title } }',
			ada.token,
		);
		expect(status).toBe(404);
		expect(codes(body)).toEqual(['NOT_FOUND']);
	});

	it('answers NOT_FOUND when the loader answers null, and asks no check', async () => {
		const { yoga, grace, asked } = await setUp();
		const { body } = await ask(
			yoga,
			'{ record(id: "r404") { title } }',
			grace.token,
		);
		expect(codes(body)).toEqual(['NOT_FOUND']);
		expect(asked.can).toBe(0);
	});
});
