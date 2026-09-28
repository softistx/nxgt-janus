import { describe, expect, it, spyOn } from 'bun:test';
import { ask, codes } from '../../test/harness';
import { wards, wired } from './permission.fixtures';

const typeDefs = /* GraphQL */ `
	type Query {
		wards(ids: [ID!]!): [String!]
			@permission(name: "enter", type: "ward", id: "args.ids")
		records(ids: [ID!]!): [String!]
			@permission(name: "view", type: "record", id: "args.ids")
		team: Team
	}

	type Team {
		wards: [WardRef!]!
		names: String @permission(name: "enter", type: "ward", id: "parent.wards.id")
	}
	type WardRef {
		id: ID!
	}
`;

async function setUp(teamWards: readonly string[] = ['w1', 'w2']) {
	const loaded: string[] = [];
	const w = await wired(
		typeDefs,
		{
			// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
			Query: {
				wards: (_: unknown, { ids }: { ids: string[] }) => ids,
				records: (_: unknown, { ids }: { ids: string[] }) => ids,
				team: () => ({
					wards: teamWards.map((id) => ({ id })),
					names: teamWards.join(', '),
				}),
			},
		},
		{
			loaders: {
				record: (id) => {
					loaded.push(id);
					return id === 'r404' ? null : { id, doctorId: doctor.id };
				},
			},
		},
	);
	const doctor = { id: w.grace.user.id };
	await wards(w);
	return { ...w, loaded };
}

describe('@permission on a list of ids', () => {
	it('lets through a user holding the permission on every one', async () => {
		const { yoga, grace, asked } = await setUp();
		const { body } = await ask(
			yoga,
			'{ wards(ids: ["w1", "w2"]) }',
			grace.token,
		);
		expect(body).toEqual({ data: { wards: ['w1', 'w2'] } });
		expect(asked.can).toBe(2);
	});

	it('denies the field when one of them is denied', async () => {
		const { yoga, ada } = await setUp();
		const { status, body } = await ask(
			yoga,
			'{ wards(ids: ["w1", "w2"]) }',
			ada.token,
		);
		expect(status).toBe(404);
		expect(codes(body)).toEqual(['NOT_FOUND']);
		expect(body.data).toEqual({ wards: null });
	});

	it('lets an empty list through: there is nothing to check', async () => {
		const { yoga, ada, asked } = await setUp();
		const { body } = await ask(yoga, '{ wards(ids: []) }', ada.token);
		expect(body).toEqual({ data: { wards: [] } });
		expect(asked.can).toBe(0);
	});

	it('loads every one, and answers NOT_FOUND when one is not there', async () => {
		const { yoga, grace, loaded } = await setUp();
		const allowed = await ask(
			yoga,
			'{ records(ids: ["r1", "r2"]) }',
			grace.token,
		);
		expect(allowed.body).toEqual({ data: { records: ['r1', 'r2'] } });
		expect(loaded).toEqual(['r1', 'r2']);

		const missing = await ask(
			yoga,
			'{ records(ids: ["r1", "r404"]) }',
			grace.token,
		);
		expect(codes(missing.body)).toEqual(['NOT_FOUND']);
	});
});

describe('@permission through a list in the parent', () => {
	it('answers an empty list NOT_FOUND: the data names nothing to check', async () => {
		const warn = spyOn(process, 'emitWarning').mockImplementation(() => {});
		const { yoga, ada, asked } = await setUp([]);
		const { status, body } = await ask(yoga, '{ team { names } }', ada.token);
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
		expect(status).toBe(404);
		expect(codes(body)).toEqual(['NOT_FOUND']);
		expect(asked.can).toBe(0);
	});

	it('checks each element the path reads', async () => {
		const { yoga, ada, grace } = await setUp();
		const nurse = await ask(yoga, '{ team { names } }', grace.token);
		expect(nurse.body).toEqual({ data: { team: { names: 'w1, w2' } } });

		const visitor = await ask(yoga, '{ team { names } }', ada.token);
		expect(codes(visitor.body)).toEqual(['NOT_FOUND']);
	});
});
