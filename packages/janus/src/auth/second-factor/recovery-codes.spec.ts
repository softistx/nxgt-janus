import { describe, expect, it } from 'bun:test';
import { resolveSealer } from '../sealing';
import {
	findRecoveryCode,
	hashRecoveryCode,
	mintRecoveryCodes,
	RECOVERY_CODES,
	readRecoveryCode,
} from './recovery-codes';

const key = (fill: number) => Buffer.alloc(32, fill).toString('base64');
const sealer = resolveSealer([{ id: 'k1', key: key(1) }], 'test');
const userId = '0190e3b4-0000-7000-8000-000000000001';

describe('recovery codes', () => {
	it('mints ten distinct codes of ten typable characters', () => {
		const codes = mintRecoveryCodes();

		expect(codes).toHaveLength(RECOVERY_CODES);
		expect(new Set(codes).size).toBe(RECOVERY_CODES);
		for (const code of codes) {
			expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
		}
	});

	it('reads a code as typed: case, spaces and dashes aside, o as 0, i and l as 1', () => {
		expect(readRecoveryCode('7K2MQ X9D4C')).toBe('7k2mqx9d4c');
		expect(readRecoveryCode(' 7k2mq-x9d4c ')).toBe('7k2mqx9d4c');
		expect(readRecoveryCode('Oi1lo-00000')).toBe('0111000000');
		expect(readRecoveryCode('7k2mq-x9d4')).toBeNull();
		expect(readRecoveryCode('7k2mq-x9d4u')).toBeNull();
		expect(readRecoveryCode('')).toBeNull();
	});

	it('stores a keyed hash naming its key, never the code', () => {
		const [code = ''] = mintRecoveryCodes();

		const hash = hashRecoveryCode(sealer, userId, code);

		expect(hash).toMatch(/^v1\.k1\.[A-Za-z0-9_-]{43}$/);
		expect(hash).not.toContain(code.replace('-', ''));
		expect(hashRecoveryCode(sealer, userId, code)).toBe(hash);
	});

	it("finds a code among the user's hashes, however it is typed", () => {
		const codes = mintRecoveryCodes();
		const hashes = codes.map((code) => hashRecoveryCode(sealer, userId, code));
		const third = (codes[2] ?? '').toUpperCase().replace('-', ' ');

		expect(findRecoveryCode(sealer, userId, hashes, third, 'test')).toBe(2);
		expect(
			findRecoveryCode(sealer, userId, hashes, 'zzzzz-zzzzz', 'test'),
		).toBe(-1);
		expect(findRecoveryCode(sealer, userId, hashes, 'not a code', 'test')).toBe(
			-1,
		);
		expect(findRecoveryCode(sealer, userId, [], codes[0] ?? '', 'test')).toBe(
			-1,
		);
	});

	it("matches nothing for another user: the user's id is hashed too", () => {
		const [code = ''] = mintRecoveryCodes();
		const hash = hashRecoveryCode(sealer, userId, code);
		const other = '0190e3b4-0000-7000-8000-000000000002';

		expect(findRecoveryCode(sealer, other, [hash], code, 'test')).toBe(-1);
	});

	it('keeps finding a code hashed under a key rotated second, and names a key removed', () => {
		const [code = ''] = mintRecoveryCodes();
		const hash = hashRecoveryCode(sealer, userId, code);
		const rotated = resolveSealer(
			[
				{ id: 'k2', key: key(2) },
				{ id: 'k1', key: key(1) },
			],
			'test',
		);
		const removed = resolveSealer([{ id: 'k2', key: key(2) }], 'test');

		expect(findRecoveryCode(rotated, userId, [hash], code, 'test')).toBe(0);
		expect(hashRecoveryCode(rotated, userId, code)).toStartWith('v1.k2.');
		expect(() =>
			findRecoveryCode(removed, userId, [hash], code, 'secondFactor.recover'),
		).toThrow(
			new TypeError(
				'secondFactor.recover: a recovery code is hashed with the key "k1", which secondFactor.keys no longer holds — keep a key until no secret or recovery code uses it',
			),
		);
	});

	it('refuses a stored value that is not a keyed hash, as a wiring mistake', () => {
		expect(() =>
			findRecoveryCode(sealer, userId, ['plain'], 'x', 'secondFactor.recover'),
		).toThrow(
			new TypeError(
				'secondFactor.recover: a stored recovery code is not a keyed hash',
			),
		);
	});
});
