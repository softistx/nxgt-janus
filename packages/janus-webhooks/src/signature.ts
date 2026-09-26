import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The signature of the Standard Webhooks specification
 * (https://www.standardwebhooks.com): HMAC-SHA256 over
 * `${webhookId}.${timestamp}.${body}`, keyed by a secret written
 * `whsec_<base64>`, and sent as `v1,<base64>` — several, space-separated,
 * while a secret is being rotated. Any receiver that implements the
 * specification checks it; `verifyWebhook` is one.
 */

const PREFIX = 'whsec_';

/** At least 24 bytes: what the specification asks of a secret. */
const MIN_BYTES = 24;

/** A new secret for an endpoint: 32 random bytes, `whsec_`-prefixed. */
export function mintWebhookSecret(): string {
	return `${PREFIX}${randomBytes(32).toString('base64')}`;
}

/**
 * The key a secret holds, or a wiring refusal: a secret is configuration,
 * never a value from a request.
 */
export function keyOf(secret: unknown, where: string): Buffer {
	if (typeof secret !== 'string' || !secret.startsWith(PREFIX)) {
		throw new TypeError(
			`${where}: a secret is written whsec_<base64> — make one with mintWebhookSecret()`,
		);
	}
	const encoded = secret.slice(PREFIX.length);
	const key = Buffer.from(encoded, 'base64');
	if (
		key.length < MIN_BYTES ||
		key.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')
	) {
		throw new TypeError(
			`${where}: a secret holds at least ${MIN_BYTES} bytes of base64 after whsec_ — make one with mintWebhookSecret()`,
		);
	}
	return key;
}

/** One `v1,<base64>` signature of a message, by one key. */
export function sign(
	key: Buffer,
	webhookId: string,
	timestamp: number,
	body: string,
): string {
	const mac = createHmac('sha256', key)
		.update(`${webhookId}.${timestamp}.${body}`)
		.digest('base64');
	return `v1,${mac}`;
}

/**
 * Whether `header` — the `webhook-signature` of a request — holds a `v1`
 * signature of the message by one of `keys`. Compared in constant time.
 */
export function signedBy(
	keys: readonly Buffer[],
	header: string,
	webhookId: string,
	timestamp: number,
	body: string,
): boolean {
	const given = header
		.split(' ')
		.filter((signature) => signature.startsWith('v1,'))
		.map((signature) => Buffer.from(signature));
	return keys.some((key) => {
		const expected = Buffer.from(sign(key, webhookId, timestamp, body));
		return given.some(
			(signature) =>
				signature.length === expected.length &&
				timingSafeEqual(signature, expected),
		);
	});
}
