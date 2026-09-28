import { describe, expect, test } from 'bun:test';
import { parseProjectPlan } from './plan';

describe('parseProjectPlan', () => {
	test('reads the package, the floors, the single ones and the command', () => {
		expect(
			parseProjectPlan([
				'janus-graphql',
				'graphql@16.9.0',
				'--single',
				'graphql',
				'@envelop/core@5.0.0',
				'--',
				'bun',
				'test',
				'--',
				'src',
			]),
		).toEqual({
			package: 'janus-graphql',
			floors: [
				{ name: 'graphql', version: '16.9.0' },
				{ name: '@envelop/core', version: '5.0.0' },
			],
			single: ['graphql'],
			command: ['bun', 'test', '--', 'src'],
		});
	});

	test('holds no floor single unless asked', () => {
		expect(
			parseProjectPlan(['janus-graphql', 'graphql@16.9.0', '--', 'bun']).single,
		).toEqual([]);
	});

	test.each([
		[[]],
		[['janus-graphql', 'graphql@16.9.0']],
		[['janus-graphql', 'graphql@16.9.0', '--']],
		[['janus-graphql', '--', 'bun']],
		[['janus-graphql', 'graphql@16.9.0', '--single', '--', 'bun']],
	])('refuses %j with the usage', (argv) => {
		expect(() => parseProjectPlan(argv)).toThrow(/^usage: /);
	});

	test.each([['..'], ['a/b'], ['Janus'], ['.hidden']])(
		'refuses the package directory %s',
		(pkg) => {
			expect(() =>
				parseProjectPlan([pkg, 'graphql@16.9.0', '--', 'bun']),
			).toThrow('is not a directory under packages/');
		},
	);

	test('refuses a malformed floor as run-on-peer-floor does', () => {
		expect(() =>
			parseProjectPlan(['janus-graphql', 'graphql@^16', '--', 'bun']),
		).toThrow('^16 is not an exact version');
		expect(() =>
			parseProjectPlan(['janus-graphql', 'GraphQL@16.9.0', '--', 'bun']),
		).toThrow('GraphQL is not an npm package name');
	});

	test('refuses a floor named twice', () => {
		expect(() =>
			parseProjectPlan([
				'janus-graphql',
				'graphql@16.9.0',
				'graphql@17.0.0',
				'--',
				'bun',
			]),
		).toThrow('a floor is named twice');
	});

	test('refuses --single on a name that is no floor', () => {
		expect(() =>
			parseProjectPlan([
				'janus-graphql',
				'graphql@16.9.0',
				'--single',
				'graphql-yoga',
				'--',
				'bun',
			]),
		).toThrow('--single graphql-yoga names no floor');
	});
});
