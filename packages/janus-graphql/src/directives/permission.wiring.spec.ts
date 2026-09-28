import { describe, expect, it } from 'bun:test';
import { buildSchema, execute, parse } from 'graphql';
import { ask, codes, setup, users } from '../../test/harness';
import { createJanusContext } from '../context';
import { janusTypeDefs } from '../sdl';
import { applyJanusDirectives } from './apply';
import { wards, wired } from './permission.fixtures';

const typeDefs = /* GraphQL */ `
	type Query {
		edit(id: ID!, locked: Boolean!): String
			@permission(name: "edit", type: "record")
		ward(id: ID!): String @permission(name: "enter", type: "ward")
	}
`;

type Row = { id: string; doctorId: null; locked: boolean };

async function setUp() {
	const seen: { object: unknown; hasJanus: boolean }[] = [];
	const w = await wired(
		typeDefs,
		{
			// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
			Query: {
				edit: (_: unknown, { id }: { id: string }) => id,
				ward: (_: unknown, { id }: { id: string }) => id,
			},
		},
		{
			loaders: {
				record: (id, ctx) => ({
					id,
					doctorId: null,
					locked:
						(ctx as { params: { variables?: { locked?: boolean } } }).params
							.variables?.locked === true,
				}),
			},
			conditions: {
				record: (object, ctx) => {
					seen.push({
						object: [object.type, object.id, (object as unknown as Row).locked],
						hasJanus: typeof (ctx as { janus?: unknown }).janus === 'object',
					});
					return { locked: (object as unknown as Row).locked };
				},
			},
		},
	);
	await w.access.grant({ type: 'record', id: 'r1' }, 'owners', w.ada.user);
	return { ...w, seen };
}

const editing = 'query ($locked: Boolean!) { edit(id: "r1", locked: $locked) }';

describe('@permission reaching a condition', () => {
	it('tests the ctx conditions answers, from the loaded object and the request', async () => {
		const { yoga, ada, seen } = await setUp();
		const open = await ask(yoga, editing, ada.token, { locked: false });
		expect(open.body).toEqual({ data: { edit: 'r1' } });
		expect(seen).toEqual([
			{
				object: ['record', 'r1', false],
				hasJanus: true,
			},
		]);

		const locked = await ask(yoga, editing, ada.token, { locked: true });
		expect(codes(locked.body)).toEqual(['NOT_FOUND']);
	});
});

describe('@permission wiring', () => {
	it('asks through an access wrapped as instrumentPermissions() wraps it', async () => {
		const w = await wired(
			'type Query { ward(id: ID!): String @permission(name: "enter", type: "ward") }',
			// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
			{ Query: { ward: () => 'w1' } },
		);
		await wards(w);
		// wired() already serves a frozen copy of access with a counting can.
		const { body } = await ask(w.yoga, '{ ward(id: "w1") }', w.ada.token);
		expect(body).toEqual({ data: { ward: 'w1' } });
		expect(w.asked.can).toBe(1);
	});

	const schemaOf = () =>
		applyJanusDirectives(
			buildSchema(
				`${janusTypeDefs}type Query { ward(id: ID!): String @permission(name: "enter", type: "ward") }`,
			),
			{ auth: setup().auth, access: setup().access },
		);

	it('refuses with a TypeError a context built with no access', async () => {
		const context = setup();
		const { ada } = await users(context);
		const request = new Request('http://yoga.test/graphql', {
			headers: { authorization: `Bearer ${ada.token}` },
		});
		const result = await execute({
			schema: schemaOf(),
			document: parse('{ ward(id: "w1") }'),
			contextValue: {
				janus: createJanusContext(request, { auth: context.auth }),
			},
		});
		expect(result.errors?.[0]?.message).toBe(
			'@permission on Query.ward: ctx.janus.access is not set — pass { access } to useJanus()',
		);
	});

	it('refuses with a TypeError a context useJanus() did not build', async () => {
		const result = await execute({
			schema: schemaOf(),
			document: parse('{ ward(id: "w1") }'),
			contextValue: {},
		});
		expect(result.errors?.[0]?.message).toBe(
			'@permission on Query.ward: ctx.janus is not set — add useJanus({ auth }) to the plugins',
		);
	});
});
