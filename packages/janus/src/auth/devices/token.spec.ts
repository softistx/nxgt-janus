import { describe, expect, it } from 'bun:test';
import { key } from '../../../test/second-factor';
import { resolveSealer } from '../sealing';
import { knownDeviceToken, mintDeviceToken } from './token';

const ada = '0190e3b4-0000-7000-8000-00000000000a';
const bob = '0190e3b4-0000-7000-8000-00000000000b';
const old = resolveSealer([{ id: 'old', key: key(1) }], 'spec');
const rotated = resolveSealer(
	[
		{ id: 'new', key: key(2) },
		{ id: 'old', key: key(1) },
	],
	'spec',
);
const forgotten = resolveSealer([{ id: 'new', key: key(2) }], 'spec');

describe('a device token', () => {
	it('is cookie-safe, and names its key', () => {
		const token = mintDeviceToken(old, ada);
		expect(token).toMatch(/^d1\.old\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
		expect(mintDeviceToken(old, ada)).not.toBe(token);
	});

	it("proves the user's device, and answers itself", () => {
		const token = mintDeviceToken(old, ada);
		expect(knownDeviceToken(old, ada, token)).toBe(token);
	});

	it('proves nothing for another user: a token is not moved between users', () => {
		expect(knownDeviceToken(old, bob, mintDeviceToken(old, ada))).toBeNull();
	});

	it('proves nothing once its mac is changed', () => {
		const token = mintDeviceToken(old, ada);
		const last = token.at(-2) === 'A' ? 'B' : 'A';
		const forged = `${token.slice(0, -2)}${last}${token.at(-1)}`;
		expect(knownDeviceToken(old, ada, forged)).toBeNull();
	});

	it('proves nothing, and throws nothing, for what a client may send', () => {
		for (const sent of ['', 'x', 'd1.old', 'd1.old.a.b', 'é'.repeat(200)]) {
			expect(knownDeviceToken(old, ada, sent)).toBeNull();
		}
	});

	it('signed by an older key, is known and signed again by the first', () => {
		const token = mintDeviceToken(old, ada);
		const again = knownDeviceToken(rotated, ada, token);
		expect(again).toStartWith('d1.new.');
		// The same device: its id is kept.
		expect(again?.split('.')[2]).toBe(token.split('.')[2]);
		expect(knownDeviceToken(rotated, ada, again as string)).toBe(again);
	});

	it('is forgotten once its key is removed', () => {
		expect(
			knownDeviceToken(forgotten, ada, mintDeviceToken(old, ada)),
		).toBeNull();
	});
});
