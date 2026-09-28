import { afterAll, afterEach, describe, expect, it, spyOn } from 'bun:test';
import { ask, codes } from '../../test/harness';
import { wards, wired } from './permission.fixtures';

const typeDefs = /* GraphQL */ `
	type Query {
		ward(id: ID!): String @permission(name: "enter", type: "ward")
		roster(id: ID!): String
			@permission(name: "manage", type: "ward", onDeny: FORBIDDEN)
		both(id: ID!): String
			@permission(name: "enter", type: "ward")
			@permission(name: "manage", type: "ward", onDeny: FORBIDDEN)
		staffOnly(id: ID!): String
			@authenticated(type: ["staff"])
			@permission(name: "enter", type: "ward")
		maybe(id: ID): String @permission(name: "enter", type: "ward")
		chart(id: ID!): Chart
	}

	"The type's check is asked before the field's."
	type Chart @permission(name: "enter", type: "ward") {
		id: ID!
		secret: String
			@permission(name: "manage", type: "ward", id: "parent.id", onDeny: FORBIDDEN)
	}
`;

const echo = (_: unknown, { id }: { id?: string }) => id ?? 'none';

async function setUp() {
	const w = await wired(typeDefs, {
		// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
		Query: {
			ward: echo,
			roster: echo,
			both: echo,
			staffOnly: echo,
			maybe: echo,
			chart: (_: unknown, { id }: { id: string }) => ({ id, secret: 'code' }),
		},
	});
	await wards(w);
	return w;
}

describe('@permission denials', () => {
	it('answers NOT_FOUND, 404, by default — the object is not told to exist', async () => {
		const { yoga, ada } = await setUp();
		const { status, body } = await ask(yoga, '{ ward(id: "w2") }', ada.token);
		expect(status).toBe(404);
		expect(body.errors?.[0]?.extensions).toEqual({ code: 'NOT_FOUND' });
	});

	it('answers FORBIDDEN, 403, with onDeny: FORBIDDEN', async () => {
		const { yoga, ada, grace } = await setUp();
		const visitor = await ask(yoga, '{ roster(id: "w1") }', ada.token);
		expect(visitor.status).toBe(403);
		expect(codes(visitor.body)).toEqual(['FORBIDDEN']);
		expect(visitor.body.errors?.[0]?.message).toBe('Forbidden');

		const nurse = await ask(yoga, '{ roster(id: "w1") }', grace.token);
		expect(nurse.body).toEqual({ data: { roster: 'w1' } });
	});

	it('requires every repeated directive, and answers the first that denies', async () => {
		const { yoga, ada, grace, asked } = await setUp();
		const nobody = await ask(yoga, '{ both(id: "w2") }', ada.token);
		expect(codes(nobody.body)).toEqual(['NOT_FOUND']);
		expect(asked.can).toBe(1); // the second was never asked

		const visitor = await ask(yoga, '{ both(id: "w1") }', ada.token);
		expect(codes(visitor.body)).toEqual(['FORBIDDEN']);

		const nurse = await ask(yoga, '{ both(id: "w1") }', grace.token);
		expect(nurse.body).toEqual({ data: { both: 'w1' } });
	});

	it("asks the type's @permission before the field's", async () => {
		const { yoga, ada, grace } = await setUp();
		// Neither holds: the type's NOT_FOUND, never the field's FORBIDDEN.
		const nobody = await ask(yoga, '{ chart(id: "w2") { secret } }', ada.token);
		expect(codes(nobody.body)).toEqual(['NOT_FOUND']);
		const visitor = await ask(
			yoga,
			'{ chart(id: "w1") { secret } }',
			ada.token,
		);
		expect(codes(visitor.body)).toEqual(['FORBIDDEN']);
		const nurse = await ask(
			yoga,
			'{ chart(id: "w1") { secret } }',
			grace.token,
		);
		expect(nurse.body).toEqual({ data: { chart: { secret: 'code' } } });
	});

	it('answers a user @authenticated refuses FORBIDDEN before asking the permission', async () => {
		const { yoga, ada, asked } = await setUp();
		const { body } = await ask(yoga, '{ staffOnly(id: "w1") }', ada.token);
		expect(codes(body)).toEqual(['FORBIDDEN']);
		expect(asked.can).toBe(0);
	});

	it('answers an id no object can hold NOT_FOUND, with no check', async () => {
		const { yoga, ada, asked } = await setUp();
		for (const id of ['', 'w1#nurses', 'w1@x', '(w1)', 'w1\u0000', '\ud800']) {
			const { body } = await ask(
				yoga,
				'query ($id: ID!) { ward(id: $id) }',
				ada.token,
				{ id },
			);
			expect(codes(body)).toEqual(['NOT_FOUND']);
		}
		expect(asked.can).toBe(0);
	});
});

describe('@permission resolving no object id', () => {
	const warn = spyOn(process, 'emitWarning').mockImplementation(() => {});
	afterEach(() => warn.mockClear());
	afterAll(() => warn.mockRestore());

	it('answers NOT_FOUND, and says why once per directive', async () => {
		const { yoga, ada, asked } = await setUp();
		for (let i = 0; i < 2; i++) {
			const { status, body } = await ask(yoga, '{ maybe }', ada.token);
			expect(status).toBe(404);
			expect(codes(body)).toEqual(['NOT_FOUND']);
		}
		expect(asked.can).toBe(0);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]).toEqual([
			'@permission on Query.maybe resolved no object id from args.id — answered NOT_FOUND',
			{ code: 'JANUS_GRAPHQL_NO_OBJECT_ID' },
		]);
	});
});
