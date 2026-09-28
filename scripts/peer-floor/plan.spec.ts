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
		[[]],
		[['@nxgt/mail@0.1.0', '--', 'bun']],
		[['@nxgt/mail@0.1.0', 'janus-mail']],
		[['@nxgt/mail@0.1.0', 'janus-mail', '--']],
		[['@nxgt/mail', 'janus-mail', '--', 'bun']],
		[['mail@0.1.0', 'janus-mail', '--', 'bun']],
		[['@nxgt/mail@^0.1.0', 'janus-mail', '--', 'bun']],
		[['@nxgt/mail@latest', 'janus-mail', '--', 'bun']],
	])('refuses %j', (argv) => {
		expect(() => parsePlan(argv)).toThrow('usage: run-on-peer-floor.ts');
	});
});
