import { describe, expect, test } from 'bun:test';
import { parsePlan } from './plan';

describe('parsePlan', () => {
	test('reads the floor, the packages and the command', () => {
		expect(
			parsePlan([
				'@nxgt/mongo@0.17.0',
				'janus-mongo',
				'janus-kit',
				'--',
				'bun',
				'test',
				'--',
				'src',
			]),
		).toEqual({
			name: '@nxgt/mongo',
			version: '0.17.0',
			packages: ['janus-mongo', 'janus-kit'],
			command: ['bun', 'test', '--', 'src'],
		});
	});

	test.each([
		['@graphql-tools/utils@10.0.0', '@graphql-tools/utils', '10.0.0'],
		['@types/node@20.0.0', '@types/node', '20.0.0'],
		['@nxgt/mail.x_y@0.1.0', '@nxgt/mail.x_y', '0.1.0'],
	])('reads the scoped name of %s', (spec, name, version) => {
		expect(parsePlan([spec, 'janus-graphql', '--', 'bun'])).toMatchObject({
			name,
			version,
		});
	});

	test.each([
		['@graphql-tools@10.0.0'],
		['@/utils@10.0.0'],
		['@graphql-tools/../utils@10.0.0'],
		['@Nxgt/mail@0.1.0'],
		['@nxgt/mail/x@0.1.0'],
	])('refuses the malformed scoped name %s', (spec) => {
		expect(() => parsePlan([spec, 'janus-mail', '--', 'bun'])).toThrow(
			'is not an npm package name',
		);
	});

	test.each([
		[[]],
		[['@nxgt/mail@0.1.0', '--', 'bun']],
		[['@nxgt/mail@0.1.0', 'janus-mail']],
		[['@nxgt/mail@0.1.0', 'janus-mail', '--']],
		[['@nxgt/mail', 'janus-mail', '--', 'bun']],
		[['@nxgt/mail@^0.1.0', 'janus-mail', '--', 'bun']],
		[['@nxgt/mail@latest', 'janus-mail', '--', 'bun']],
	])('refuses %j', (argv) => {
		expect(() => parsePlan(argv)).toThrow('usage: run-on-peer-floor.ts');
	});
});
