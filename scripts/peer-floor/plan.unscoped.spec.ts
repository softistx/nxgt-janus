import { describe, expect, test } from 'bun:test';
import { parsePlan } from './plan';

describe('parsePlan', () => {
	test.each([
		['graphql@16.9.0', 'graphql', '16.9.0'],
		['mail@0.1.0', 'mail', '0.1.0'],
		['lodash.merge@4.6.2', 'lodash.merge', '4.6.2'],
		['string_decoder@1.3.0', 'string_decoder', '1.3.0'],
	])('reads the unscoped name of %s', (spec, name, version) => {
		expect(parsePlan([spec, 'janus-graphql', '--', 'bun', 'test'])).toEqual({
			name,
			version,
			packages: ['janus-graphql'],
			command: ['bun', 'test'],
		});
	});

	test.each([
		['graphql', 'usage: run-on-peer-floor.ts'],
		['@16.9.0', 'usage: run-on-peer-floor.ts'],
		['graphql@^16.9.0', 'is not an exact version'],
		['graphql@latest', 'is not an exact version'],
		['graphql@16.9', 'is not an exact version'],
		['GraphQL@16.9.0', 'is not an npm package name'],
		['.graphql@16.9.0', 'is not an npm package name'],
		['_graphql@16.9.0', 'is not an npm package name'],
		['-graphql@16.9.0', 'is not an npm package name'],
		['graph ql@16.9.0', 'is not an npm package name'],
		['graphql/utils@16.9.0', 'is not an npm package name'],
		['../graphql@16.9.0', 'is not an npm package name'],
		['..@16.9.0', 'is not an npm package name'],
		['~graphql@16.9.0', 'is not an npm package name'],
		[`${'a'.repeat(215)}@1.0.0`, 'is not an npm package name'],
	])('refuses the malformed %s', (spec, message) => {
		const run = () => parsePlan([spec, 'janus-graphql', '--', 'bun']);
		expect(run).toThrow(message);
		expect(run).toThrow('usage: run-on-peer-floor.ts');
	});
});
