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

	it('refuses a schema that uses @permission, which is not enforced yet', () => {
		const { auth } = setup();
		const schema = schemaOf(
			'type Query { record(id: ID!): String @permission(name: "view", type: "record") }',
		);
		expect(() => change(useJanus({ auth }), schema)).toThrow(
			new TypeError(
				'applyJanusDirectives(): @permission on Query.record is not enforced yet — check it in the resolver with can(ctx, …) until it is',
			),
		);
	});

	it('refuses a @permission on a type, naming the field that reads it', () => {
		const schema = schemaOf(
			'type Query { record: Record } type Record @permission(name: "view", type: "record") { id: ID! }',
		);
		expect(() =>
			applyJanusDirectives(schema, { auth: { types: ['patient'] } }),
		).toThrow(
			/@permission on Record \(read by Record\.id\) is not enforced yet/,
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
});
