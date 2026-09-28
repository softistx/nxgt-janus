import { describe, expect, test } from 'bun:test';
import { matchesIntegrity, parsePlan } from './run-on-peer-floor';

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

describe('matchesIntegrity', () => {
	const bytes = new TextEncoder().encode('floor');
	const hasher = new Bun.CryptoHasher('sha512');
	hasher.update(bytes);
	const integrity = `sha512-${hasher.digest('base64')}`;

	test('accepts the sha512 of the bytes', () => {
		expect(matchesIntegrity(integrity, bytes)).toBe(true);
	});

	test('refuses other bytes', () => {
		expect(matchesIntegrity(integrity, new TextEncoder().encode('flor'))).toBe(
			false,
		);
	});

	test('refuses an algorithm other than sha512', () => {
		expect(matchesIntegrity('sha1-abc', bytes)).toBe(false);
		expect(matchesIntegrity('sha512-', bytes)).toBe(false);
	});
});
