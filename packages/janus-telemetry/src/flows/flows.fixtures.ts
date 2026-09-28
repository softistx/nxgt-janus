import { createHmac } from 'node:crypto';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { instrumentJanus } from './index';

export const email = 'ada@example.test';
export const password = 'correct horse battery';

/** Two user types, traced, over memory stores whose `findUserByLogin` fails while `outage.on`. */
export function setup() {
	const stores = createMemoryStores();
	const outage = { on: false };
	const find = stores.users.findUserByLogin.bind(stores.users);
	const auth = instrumentJanus(
		janus({
			users: {
				patient: {
					schema: z.strictObject({ email: z.email() }),
					password: { login: 'email' },
				},
				staff: {
					schema: z.strictObject({ username: z.string() }),
					password: { login: 'username' },
				},
			},
			store: {
				...stores,
				users: {
					...stores.users,
					findUserByLogin: (...args) => {
						if (outage.on) throw new Error('connection refused');
						return find(...args);
					},
				},
			},
			hasher: scryptHasher({ cost: 10 }),
		}),
	);
	return { auth, outage };
}

/** One user type with a second factor, traced, over memory stores. */
export function twoFactor() {
	return instrumentJanus(
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
}

/** The code an authenticator app shows at `ms`: RFC 6238, as the core checks it. */
export function totp(base32: string, ms: number): string {
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
