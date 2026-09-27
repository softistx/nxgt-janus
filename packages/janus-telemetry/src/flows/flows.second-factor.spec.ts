import { describe, expect, it } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { collect, rejection } from '../../test/collect';
import { email, password } from './flows.fixtures';
import { instrumentJanus } from './index';

describe('instrumentJanus()', () => {
	it('writes the second factor — asked, enrolled, activated, confirmed, refused — with no secret, challenge or code', async () => {
		const auth = instrumentJanus(
			janus({
				user: z.strictObject({ email: z.email() }),
				password: { login: 'email' },
				store: createMemoryStores(),
				hasher: scryptHasher({ cost: 10 }),
				secondFactor: {
					issuer: 'Clinic',
					keys: [{ id: 'k1', key: Buffer.alloc(32, 1).toString('base64') }],
				},
			}),
		);
		const secrets: string[] = [];
		let id = '';
		const { spans, logs } = await collect(async () => {
			const { user } = await auth.signUp({ email, password });
			id = user.id;
			const { secret, uri } = await auth.secondFactor.enroll(user);
			const first = totp(secret, Date.now());
			await auth.secondFactor.activate(user, first);
			const asked = await auth.signIn({ email, password });
			if (asked.status !== 'secondFactor')
				throw new Error('expected a challenge');
			await rejection(auth.secondFactor.confirm(asked.challenge, 'abcdef'));
			// The next step's code: the one activation used is spent.
			const code = totp(secret, Date.now() + 30_000);
			const signedIn = await auth.secondFactor.confirm(asked.challenge, code);
			secrets.push(secret, uri, asked.challenge, first, code, signedIn.token);
			// An e-mailed code proves the e-mail, and the factor is asked again.
			const issued = await auth.signInCode.request(email);
			if (issued === null) throw new Error('expected a code');
			const byCode = await auth.signInCode.confirm(
				issued.challenge,
				issued.code,
			);
			if (byCode.status !== 'secondFactor')
				throw new Error('expected a challenge');
			secrets.push(issued.code, issued.challenge, byCode.challenge);
			await auth.secondFactor.disable(user);
		});

		const signIn = spans.find((span) => span.name === 'janus.signIn');
		expect(signIn?.attributes['janus.signIn.status']).toBe('secondFactor');
		expect(logs.map((log) => log.name)).toEqual(
			expect.arrayContaining([
				'janus.signIn.secondFactor',
				'janus.secondFactor.enrolled',
				'janus.secondFactor.activated',
				'janus.secondFactor.disabled',
			]),
		);
		// From signIn, then from signInCode.confirm: both name the user.
		expect(
			logs
				.filter((log) => log.name === 'janus.signIn.secondFactor')
				.map((log) => log.attributes),
		).toEqual([
			{ 'janus.user.type': 'user', 'user.id': id },
			{ 'janus.user.type': 'user', 'user.id': id },
		]);
		const refused = logs.find((log) => log.name === 'janus.signIn.refused');
		expect(refused?.attributes).toMatchObject({
			'janus.refusal': 'CODE_INVALID',
			'janus.secondFactor.attemptsLeft': 4,
			'user.id': id,
		});
		const confirmed = logs.filter((log) => log.name === 'janus.signIn');
		expect(confirmed.at(-1)?.attributes).toMatchObject({
			'janus.signIn.secondFactor': true,
			'user.id': id,
		});
		const written = JSON.stringify({ spans, logs });
		for (const secret of secrets) expect(written).not.toContain(secret);
	});
});

/** The code an authenticator app shows at `ms`: RFC 6238, as the core checks it. */
function totp(base32: string, ms: number): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const char of base32)
		bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
	const key = Buffer.from(
		(bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)),
	);
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(ms / 30_000)));
	const digest = createHmac('sha1', key).update(counter).digest();
	const offset = (digest[19] as number) & 0x0f;
	return String(
		(digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000,
	).padStart(6, '0');
}
