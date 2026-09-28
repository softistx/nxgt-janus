import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import {
	createMemoryStores,
	fixedClock,
	janus,
	scryptHasher,
	type UserEvent,
} from '@nxgt/janus';
import { z } from 'zod';
import { baseOptions, links } from '../test/setup';
import { janusMail } from './janus-mail';
import type { JanusMailLinks } from './types';

// The recovery code notice, wired as a consumer wires it: on
// `user.recoveryCodeUsed`, the user read back by id and the codes left read
// with `secondFactor.recoveryCodesLeft` — the event carries neither.

/** RFC 6238's code for `secret` (base32) at `now`: what an authenticator app shows. */
function totp(secret: string, now: Date): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const char of secret.replace(/=+$/, '')) {
		bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
	}
	const key = Buffer.from(
		(bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)),
	);
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(now.getTime() / 30_000)));
	const digest = createHmac('sha1', key).update(counter).digest();
	const offset = (digest.at(-1) ?? 0) & 0xf;
	return String(
		(digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000,
	).padStart(6, '0');
}

/** A `janus()` whose listener sends the notice, and a user whose factor is active. */
async function wired(mailLinks: JanusMailLinks = links) {
	const options = { ...baseOptions(), links: mailLinks };
	const mail = janusMail(options);
	const clock = fixedClock(Date.UTC(2026, 8, 28, 12, 5));
	const auth = janus({
		user: z.strictObject({
			email: z.email(),
			name: z.string(),
			locale: z.string(),
		}),
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher: scryptHasher({ cost: 10 }), // the cheapest: ten sign-ins in one test
		clock,
		secondFactor: {
			issuer: 'Acme',
			keys: [{ id: 'k1', key: Buffer.alloc(32, 1).toString('base64') }],
		},
		async events(event: UserEvent) {
			if (event.type === 'user.recoveryCodeUsed') {
				const user = await auth.get(event.userId);
				const recoveryCodesLeft =
					await auth.secondFactor.recoveryCodesLeft(user);
				if (recoveryCodesLeft === null) return;
				const when = new Intl.DateTimeFormat(user.locale, {
					dateStyle: 'long',
					timeStyle: 'short',
					timeZone: 'Europe/Paris',
				}).format(event.occurredAt);
				await mail.recoveryCodeUsed(
					{ name: user.name, locale: user.locale, email: user.email },
					{ when, recoveryCodesLeft },
				);
			}
		},
	});
	const password = 'correct horse battery staple';
	const { user } = await auth.signUp({
		email: 'ada@example.com',
		name: 'Ada',
		locale: 'fr',
		password,
	});
	const { secret } = await auth.secondFactor.enroll(user);
	const { recoveryCodes } = await auth.secondFactor.activate(
		user,
		totp(secret, clock.now()),
	);
	/** Signs in with the password, then spends `code` on the challenge. */
	const recover = async (code: string) => {
		const result = await auth.signIn({ email: user.email, password });
		if (result.status !== 'secondFactor')
			throw new Error('expected a challenge');
		return auth.secondFactor.recover(result.challenge, code);
	};
	options.mailer.clear();
	return { mailer: options.mailer, recoveryCodes, recover };
}

describe('recoveryCodeUsed on user.recoveryCodeUsed', () => {
	test('tells the user, in their locale, when and how many codes are left', async () => {
		const { mailer, recoveryCodes, recover } = await wired();
		const signedIn = await recover(recoveryCodes[0] ?? '');
		expect(signedIn.recoveryCodesLeft).toBe(9);
		expect(mailer.sent).toHaveLength(1);
		const [sent] = mailer.sent;
		expect(sent?.to).toBe('ada@example.com');
		expect(sent?.subject).toBe(
			'Un code de récupération a été utilisé sur votre compte',
		);
		expect(sent?.text).toContain('28 septembre 2026');
		expect(sent?.text).toContain('Il vous reste 9 codes de récupération.');
		expect(sent?.html).toContain('Il vous reste 9 codes de récupération.');
	});

	test('links to links.secureAccount without links.recoveryCodes', async () => {
		const { mailer, recoveryCodes, recover } = await wired();
		await recover(recoveryCodes[0] ?? '');
		expect(mailer.sent[0]?.text).toContain(
			'https://acme.example/account/security',
		);
	});

	test('links to links.recoveryCodes when it is given', async () => {
		const { mailer, recoveryCodes, recover } = await wired({
			...links,
			recoveryCodes: () => 'https://acme.example/account/recovery-codes',
		});
		await recover(recoveryCodes[0] ?? '');
		expect(mailer.sent[0]?.html).toContain(
			'https://acme.example/account/recovery-codes',
		);
		expect(mailer.sent[0]?.text).not.toContain(
			'https://acme.example/account/security',
		);
	});

	test('says the singular, then that none are left, as the count goes down', async () => {
		const { mailer, recoveryCodes, recover } = await wired();
		for (const code of recoveryCodes) await recover(code);
		const texts = mailer.sent.map((sent) => sent.text);
		expect(texts).toHaveLength(10);
		expect(texts[8]).toContain('Il vous reste 1 code de récupération.');
		expect(texts[9]).toContain('Il ne vous reste aucun code de récupération.');
	});
});
