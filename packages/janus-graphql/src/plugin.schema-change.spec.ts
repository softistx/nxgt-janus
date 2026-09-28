import { describe, expect, it } from 'bun:test';
import type { Plugin } from '@envelop/core';
import { buildSchema, type GraphQLSchema } from 'graphql';
import { setup } from '../test/harness';
import { applyJanusDirectives } from './directives/apply';
import { useJanus } from './plugin';
import { janusTypeDefs } from './sdl';

const schemaOf = (sdl: string) => buildSchema(janusTypeDefs + sdl);

/** Calls the plugin's hook the way envelop does: `replaceSchema` calls it again. */
function change(plugin: Pick<Plugin, 'onSchemaChange'>, schema: GraphQLSchema) {
	const replaced: GraphQLSchema[] = [];
	const hook = plugin.onSchemaChange;
	if (hook === undefined) throw new Error('useJanus() has no onSchemaChange');
	const replaceSchema = (next: GraphQLSchema) => {
		replaced.push(next);
		if (replaced.length > 5) throw new Error('replaceSchema loops');
		hook({ schema: next, replaceSchema });
	};
	hook({ schema, replaceSchema });
	return replaced;
}

describe('useJanus() on a schema change', () => {
	it('replaces the schema once, and passes over the one it made', () => {
		const { auth } = setup();
		const plugin = useJanus({ auth });
		const schema = schemaOf('type Query { me: String @authenticated }');
		const replaced = change(plugin, schema);
		expect(replaced).toHaveLength(1);
		expect(replaced[0]).not.toBe(schema);
	});

	it('transforms a new schema it is given later, as a gateway reloading does', () => {
		const { auth } = setup();
		const plugin = useJanus({ auth });
		change(plugin, schemaOf('type Query { me: String @authenticated }'));
		const replaced = change(
			plugin,
			schemaOf('type Query { you: String @authenticated }'),
		);
		expect(replaced).toHaveLength(1);
	});

	it('refuses a schema that uses @permission when it was given no access', () => {
		const { auth } = setup();
		const schema = schemaOf(
			'type Query { ward(id: ID!): String @permission(name: "enter", type: "ward") }',
		);
		expect(() => change(useJanus({ auth }), schema)).toThrow(
			new TypeError(
				'applyJanusDirectives(): @permission on Query.ward needs the permissions() instance — pass useJanus({ auth, access }), with access what permissions() answered',
			),
		);
	});

	it('applies @permission with the access, loaders and conditions it was given', () => {
		const { auth, access } = setup();
		const schema = schemaOf(
			'type Query { record(id: ID!): String @permission(name: "edit", type: "record") }',
		);
		const plugin = useJanus({
			auth,
			access,
			loaders: { record: () => null },
			conditions: { record: () => ({ locked: false }) },
		});
		expect(change(plugin, schema)).toHaveLength(1);
	});

	it('refuses a @permission on a type, naming the field that reads it', () => {
		const schema = schemaOf(
			'type Query { record: Record } type Record @permission(name: "view", type: "record") { id: ID! }',
		);
		expect(() =>
			applyJanusDirectives(schema, { auth: { types: ['patient'] } }),
		).toThrow(
			/@permission on Record \(read by Record\.id\) needs the permissions\(\) instance/,
		);
	});

	it('refuses a type auth does not know, before reading a directive', () => {
		const schema = schemaOf('type Query { open: String }');
		const auth = { types: ['patient', 'staff'] } as { types: string[] };
		expect(() =>
			applyJanusDirectives(schema, { auth, type: 'doctor' }),
		).toThrow(
			new TypeError(
				"applyJanusDirectives(): type 'doctor' is not a user type of auth — it knows 'patient', 'staff'",
			),
		);
	});

	it('leaves a schema with no directive answering as it did', () => {
		const schema = schemaOf('type Query { open: String }');
		const applied = applyJanusDirectives(schema, {
			auth: { types: ['patient'] },
		});
		expect(Object.keys(applied.getQueryType()?.getFields() ?? {})).toEqual([
			'open',
		]);
	});
});

describe('useJanus() wiring', () => {
	it('refuses with a TypeError an auth that is not what janus() answered', () => {
		expect(() => useJanus({ auth: {} as never })).toThrow(
			new TypeError(
				'useJanus(): auth is not what janus() answered — pass { auth }',
			),
		);
	});

	it('refuses with a TypeError an access that is not what permissions() answered', () => {
		const { auth } = setup();
		for (const access of [{}, null]) {
			expect(() => useJanus({ auth, access: access as never })).toThrow(
				new TypeError(
					'useJanus(): access is not what permissions() answered — pass { auth, access }',
				),
			);
		}
	});
});
