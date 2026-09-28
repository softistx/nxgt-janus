import { describe, expect, test } from 'bun:test';
import { matchesIntegrity } from './fetch';

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
