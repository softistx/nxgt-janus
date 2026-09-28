import { describe, expect, it } from 'bun:test';
import { buildSchema, GraphQLEnumType } from 'graphql';
import { janusTypeDefs } from './sdl';

describe('janusTypeDefs', () => {
	it('is graphql/janus.graphqls, byte for byte', async () => {
		const shipped = await Bun.file(
			new URL('../graphql/janus.graphqls', import.meta.url),
		).text();
		expect(janusTypeDefs).toBe(shipped);
	});

	it('declares both directives and the denial enum', () => {
		const schema = buildSchema(`${janusTypeDefs}type Query { ok: String }`);
		const authenticated = schema.getDirective('authenticated');
		const permission = schema.getDirective('permission');

		expect(
			authenticated?.args.map((arg) => `${arg.name}: ${arg.type}`),
		).toEqual(['type: [String!]']);
		expect(permission?.isRepeatable).toBe(true);
		expect(permission?.args.map((arg) => `${arg.name}: ${arg.type}`)).toEqual([
			'name: String!',
			'type: String!',
			'id: String',
			'onDeny: PermissionDenial!',
		]);
		const denial = schema.getType('PermissionDenial');
		expect(denial instanceof GraphQLEnumType).toBe(true);
		expect(
			(denial as GraphQLEnumType).getValues().map((value) => value.name),
		).toEqual(['NOT_FOUND', 'FORBIDDEN']);
	});
});
