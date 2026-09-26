import { describe, expect, it } from 'bun:test';
import { keyOf, mintWebhookSecret, sign, signedBy } from './signature';

describe('mintWebhookSecret', () => {
	it('mints a whsec_ secret of 32 random bytes, a new one each time', () => {
		const secret = mintWebhookSecret();

		expect(secret).toStartWith('whsec_');
		expect(keyOf(secret, 'test')).toHaveLength(32);
		expect(mintWebhookSecret()).not.toBe(secret);
	});
});

describe('keyOf', () => {
	it.each([
		['no prefix', Buffer.alloc(32).toString('base64')],
		['not a string', 42],
		['fewer than 24 bytes', `whsec_${Buffer.alloc(16).toString('base64')}`],
		['not base64', `whsec_${'!'.repeat(40)}`],
	])('refuses a secret with %s', (_, secret) => {
		expect(() => keyOf(secret, 'webhooks')).toThrow(TypeError);
	});
});

describe('sign', () => {
	// The example of the Standard Webhooks specification, verbatim: a
	// signature any other implementation computes the same.
	it('computes the specification example', () => {
		const key = keyOf('whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', 'test');
		const body = '{"test": 2432232314}';

		expect(sign(key, 'msg_p5jXN8AQM9LWM0D4loKWxJek', 1614265330, body)).toBe(
			'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
		);
	});
});

describe('signedBy', () => {
	const old = keyOf(mintWebhookSecret(), 'test');
	const fresh = keyOf(mintWebhookSecret(), 'test');
	const signature = (key: Buffer) => sign(key, 'id', 1, 'body');

	it('accepts any one of several signatures, by any one of several keys', () => {
		const header = `${signature(old)} ${signature(fresh)}`;

		expect(signedBy([fresh], header, 'id', 1, 'body')).toBe(true);
		expect(signedBy([old], signature(old), 'id', 1, 'body')).toBe(true);
	});

	it('refuses another key, another message, and a version other than v1', () => {
		expect(signedBy([fresh], signature(old), 'id', 1, 'body')).toBe(false);
		expect(signedBy([old], signature(old), 'id', 2, 'body')).toBe(false);
		expect(signedBy([old], signature(old), 'id', 1, 'bodY')).toBe(false);
		expect(
			signedBy([old], signature(old).replace('v1,', 'v2,'), 'id', 1, 'body'),
		).toBe(false);
	});
});
