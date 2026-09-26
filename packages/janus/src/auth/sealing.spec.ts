import { describe, expect, it } from 'bun:test';
import { resolveSealer, seal, unseal } from './sealing';

const key = (fill: number) => Buffer.alloc(32, fill).toString('base64');

describe('sealing', () => {
	it('opens what it sealed, and names the key that sealed it', () => {
		const sealer = resolveSealer([{ id: 'k1', key: key(1) }], 'test');
		const sealed = seal(sealer, 'JBSWY3DPEHPK3PXP', 'user-1');

		expect(sealed).toStartWith('v1.k1.');
		expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
		expect(unseal(sealer, sealed, 'user-1', 'test')).toEqual({
			plain: 'JBSWY3DPEHPK3PXP',
			keyId: 'k1',
		});
	});

	it('seals twice to two values: a fresh iv every time', () => {
		const sealer = resolveSealer([{ id: 'k1', key: key(1) }], 'test');
		expect(seal(sealer, 'same', 'u')).not.toBe(seal(sealer, 'same', 'u'));
	});

	it('seals with the first key and opens with any: a rotation', () => {
		const before = resolveSealer([{ id: 'old', key: key(1) }], 'test');
		const sealed = seal(before, 'secret', 'u');
		const after = resolveSealer(
			[
				{ id: 'new', key: key(2) },
				{ id: 'old', key: key(1) },
			],
			'test',
		);

		expect(unseal(after, sealed, 'u', 'test').keyId).toBe('old');
		expect(seal(after, 'secret', 'u')).toStartWith('v1.new.');
	});

	it('does not open for another user: the id is bound in', () => {
		const sealer = resolveSealer([{ id: 'k1', key: key(1) }], 'test');
		const sealed = seal(sealer, 'secret', 'user-1');
		expect(() => unseal(sealer, sealed, 'user-2', 'test')).toThrow(
			'does not open with the key "k1"',
		);
	});

	it('refuses a key it no longer holds, or one changed under the same id', () => {
		const sealed = seal(
			resolveSealer([{ id: 'k1', key: key(1) }], 'test'),
			'secret',
			'u',
		);
		expect(() =>
			unseal(
				resolveSealer([{ id: 'k2', key: key(1) }], 'test'),
				sealed,
				'u',
				'test',
			),
		).toThrow('which secondFactor.keys no longer holds');
		expect(() =>
			unseal(
				resolveSealer([{ id: 'k1', key: key(3) }], 'test'),
				sealed,
				'u',
				'test',
			),
		).toThrow('changed under the same id');
		expect(() =>
			unseal(
				resolveSealer([{ id: 'k1', key: key(1) }], 'test'),
				'plain',
				'u',
				'test',
			),
		).toThrow('not a sealed one');
	});

	it('refuses keys that cannot seal, as wiring mistakes', () => {
		for (const [keys, message] of [
			[[], 'at least one key'],
			[undefined, 'at least one key'],
			[[{ id: 'a.b', key: key(1) }], 'letters, digits'],
			[[{ id: 'k', key: 'short' }], 'not 32 bytes'],
			[[{ id: 'k', key: Buffer.alloc(16).toString('base64') }], 'not 32 bytes'],
			[
				[
					{ id: 'k', key: key(1) },
					{ id: 'k', key: key(2) },
				],
				'two keys have the id "k"',
			],
		] as const) {
			expect(() => resolveSealer(keys, 'janus: secondFactor.keys')).toThrow(
				message,
			);
		}
		expect(
			resolveSealer(
				[{ id: 'k', key: Buffer.alloc(32, 250).toString('base64url') }],
				'test',
			).sealWith,
		).toBe('k');
	});
});
