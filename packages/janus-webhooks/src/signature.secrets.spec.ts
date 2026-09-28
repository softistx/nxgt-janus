import { describe, expect, it } from 'bun:test';
import { keyOf } from './signature';

// Which secrets keyOf() reads: the Standard Webhooks specification asks for
// 24 to 64 bytes, base64-encoded after whsec_.

const secretOf = (bytes: number) =>
	`whsec_${Buffer.alloc(bytes, 7).toString('base64')}`;

const tooShort =
	'webhooks: a secret holds at least 24 bytes of base64 after whsec_ — make one with mintWebhookSecret()';
const tooLong =
	'webhooks: a secret holds at most 64 bytes of base64 after whsec_ — make one with mintWebhookSecret()';

describe('keyOf', () => {
	it.each([24, 32, 64])('reads a secret of %i bytes', (bytes) => {
		expect(keyOf(secretOf(bytes), 'webhooks')).toHaveLength(bytes);
	});

	it.each([
		['no prefix', Buffer.alloc(32).toString('base64')],
		['not a string', 42],
	])('refuses a secret with %s', (_, secret) => {
		expect(() => keyOf(secret, 'webhooks')).toThrow(
			'webhooks: a secret is written whsec_<base64> — make one with mintWebhookSecret()',
		);
	});

	it.each([
		['16 bytes', secretOf(16)],
		['23 bytes', secretOf(23)],
		['characters that are not base64', `whsec_${'!'.repeat(40)}`],
		['a trailing newline', `${secretOf(32)}\n`],
	])('refuses a secret of %s as too short or malformed', (_, secret) => {
		expect(() => keyOf(secret, 'webhooks')).toThrow(tooShort);
	});

	it.each([65, 128])(
		'refuses a secret of %i bytes: past the 64 the specification allows',
		(bytes) => {
			expect(() => keyOf(secretOf(bytes), 'webhooks')).toThrow(tooLong);
		},
	);
});
