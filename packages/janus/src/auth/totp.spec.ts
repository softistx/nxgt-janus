import { describe, expect, it } from 'bun:test';
import {
	codeAt,
	fromBase32,
	matchStep,
	otpauthUri,
	stepAt,
	toBase32,
} from './totp';

// RFC 6238, appendix B: the SHA-1 seed, and the last six digits of each code.
const SEED = Buffer.from('12345678901234567890');

describe('totp', () => {
	it('answers the codes of RFC 6238, appendix B', () => {
		for (const [seconds, code] of [
			[59, '287082'],
			[1111111109, '081804'],
			[1234567890, '005924'],
			[2000000000, '279037'],
		] as const) {
			expect(codeAt(SEED, stepAt(new Date(seconds * 1000)))).toBe(code);
		}
	});

	it('round-trips base32, as RFC 4648 writes it', () => {
		expect(toBase32(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
		expect(fromBase32('MZXW6YTBOI').toString()).toBe('foobar');
		expect(() => fromBase32('not base32!')).toThrow(TypeError);
	});

	it('accepts the step before and after, and nothing further', () => {
		const now = new Date(1234567890 * 1000);
		const step = stepAt(now);
		for (const drift of [-1, 0, 1]) {
			expect(matchStep(SEED, codeAt(SEED, step + drift), now, null)).toBe(
				step + drift,
			);
		}
		expect(matchStep(SEED, codeAt(SEED, step - 2), now, null)).toBeNull();
		expect(matchStep(SEED, codeAt(SEED, step + 2), now, null)).toBeNull();
	});

	it('accepts a step only after the last one used: a code is used once', () => {
		const now = new Date(1234567890 * 1000);
		const step = stepAt(now);
		const code = codeAt(SEED, step);
		expect(matchStep(SEED, code, now, step)).toBeNull();
		expect(matchStep(SEED, code, now, step - 1)).toBe(step);
	});

	it('refuses what is not six digits, without computing anything', () => {
		const now = new Date(59_000);
		for (const code of ['', '28708', '2870822', ' 87082', '28708a']) {
			expect(matchStep(SEED, code, now, null)).toBeNull();
		}
	});

	it('writes the URI an authenticator app reads', () => {
		const uri = new URL(otpauthUri('Clinic & Co', 'ada@example.test', 'ABC'));
		expect(uri.protocol).toBe('otpauth:');
		expect(uri.host).toBe('totp');
		expect(decodeURIComponent(uri.pathname)).toBe(
			'/Clinic & Co:ada@example.test',
		);
		expect(Object.fromEntries(uri.searchParams)).toEqual({
			secret: 'ABC',
			issuer: 'Clinic & Co',
			algorithm: 'SHA1',
			digits: '6',
			period: '30',
		});
	});
});
