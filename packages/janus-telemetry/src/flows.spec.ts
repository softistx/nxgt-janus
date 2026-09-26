import { describe, expect, it } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { collect, rejection } from '../test/collect';
import { instrumentJanus } from './flows';

const email = 'ada@example.test';
const password = 'correct horse battery';

function setup() {
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

describe('instrumentJanus()', () => {
	it('traces a flow in a span named after it, with whose it is', async () => {
		const { auth } = setup();
		let id = '';
		const { spans, logs } = await collect(async () => {
			const { user } = await auth.patient.signUp({ email, password });
			id = user.id;
		});

		const signUp = spans.find((span) => span.name === 'janus.patient.signUp');
		expect(signUp?.status).toBe('ok');
		expect(signUp?.attributes).toMatchObject({
			'janus.user.type': 'patient',
			'user.id': id,
		});
		expect(logs.map((log) => [log.name, log.attributes])).toContainEqual([
			'janus.signUp',
			expect.objectContaining({ 'janus.user.type': 'patient', 'user.id': id }),
		]);
	});

	it('leaves a refused sign-in ok, and warns why — never with the login', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		let refusal: unknown;
		const { spans, logs } = await collect(async () => {
			refusal = await rejection(
				auth.patient.signIn({ email, password: 'wrong horse' }),
			);
		});

		expect(refusal).toMatchObject({ code: 'CREDENTIALS_INVALID' });
		const signIn = spans.find((span) => span.name === 'janus.patient.signIn');
		expect(signIn?.status).toBe('ok');
		expect(signIn?.attributes['janus.refusal']).toBe('CREDENTIALS_INVALID');
		const warned = logs.find((log) => log.name === 'janus.signIn.refused');
		expect(warned?.severity).toBe('warn');
		expect(warned?.attributes).toMatchObject({
			'janus.refusal': 'CREDENTIALS_INVALID',
			'janus.refusal.reason': 'wrongPassword',
			'janus.user.type': 'patient',
		});
		expect(user.id).toBeString();
	});

	it('fails the span on an outage, naming the store that could not answer', async () => {
		const { auth, outage } = setup();
		outage.on = true;
		let failure: unknown;
		const { spans, logs } = await collect(async () => {
			failure = await rejection(auth.patient.signIn({ email, password }));
		});

		expect(failure).toMatchObject({ code: 'STORE_FAILED' });
		const signIn = spans.find((span) => span.name === 'janus.patient.signIn');
		expect(signIn?.status).toBe('error');
		expect(signIn?.attributes).toMatchObject({
			'janus.error.code': 'STORE_FAILED',
			'janus.store.slot': 'users',
			'janus.store.operation': 'findUserByLogin',
		});
		expect(logs.some((log) => log.name === 'janus.signIn.refused')).toBe(false);
	});

	it('writes no login, password, token or session id in any signal', async () => {
		const { auth } = setup();
		const secrets: string[] = [email, password];
		const { all } = await collect(async () => {
			const signedUp = await auth.patient.signUp({ email, password });
			const signedIn = await auth.patient.signIn({ email, password });
			secrets.push(signedUp.token, signedIn.token, signedIn.session.id);
			await rejection(auth.patient.signIn({ email, password: 'wrong horse' }));
			await auth.authenticate(
				new Request('https://x.test', {
					headers: { authorization: `Bearer ${signedIn.token}` },
				}),
			);
			await auth.patient.findByLogin(email);
			const verification = await auth.patient.verifyEmail.send(signedIn.user);
			secrets.push(verification.token);
			await auth.patient.verifyEmail.confirm(verification.token);
			const reset = await auth.patient.resetPassword.request(email);
			if (reset === null) throw new Error('the reset was not issued');
			secrets.push(reset.token);
			await auth.patient.resetPassword.confirm(
				reset.token,
				'reset horse battery',
			);
			const again = await auth.patient.signIn({
				email,
				password: 'reset horse battery',
			});
			secrets.push(again.token, again.session.id);
			await auth.signOut(
				new Request('https://x.test', {
					headers: { authorization: `Bearer ${again.token}` },
				}),
			);
			const last = await auth.patient.signIn({
				email,
				password: 'reset horse battery',
			});
			secrets.push(last.token, last.session.id);
			await auth.patient.changePassword(last.user, {
				current: 'reset horse battery',
				next: 'another horse battery',
			});
			await auth.patient.delete(last.user);
		});

		const written = JSON.stringify(all);
		for (const secret of secrets) expect(written).not.toContain(secret);
		for (const name of [
			'janus.email.verified',
			'janus.password.reset',
			'janus.signOut',
			'janus.password.changed',
			'janus.user.deleted',
		]) {
			expect(written).toContain(name);
		}
	});

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

	it('writes a sign-in code sent, confirmed and refused — never the code or its challenge', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		const secrets: string[] = [];
		const { spans, logs } = await collect(async () => {
			expect(
				await auth.patient.signInCode.request('nobody@example.test'),
			).toBeNull();
			const issued = await auth.patient.signInCode.request(email);
			if (issued === null) throw new Error('expected a code');
			const wrong = issued.code === '000000' ? '111111' : '000000';
			await rejection(auth.patient.signInCode.confirm(issued.challenge, wrong));
			const signedIn = await auth.patient.signInCode.confirm(
				issued.challenge,
				issued.code,
			);
			secrets.push(issued.code, issued.challenge, signedIn.token);
		});

		const sent = logs.filter((log) => log.name === 'janus.signInCode.sent');
		expect(sent.map((log) => log.attributes['user.id'])).toEqual([user.id]);
		expect(
			logs.find((log) => log.name === 'janus.signIn.refused')?.attributes,
		).toMatchObject({
			'janus.refusal': 'CODE_INVALID',
			'janus.secondFactor.attemptsLeft': 4,
			'janus.signIn.code': true,
		});
		expect(
			logs.find((log) => log.name === 'janus.signIn')?.attributes,
		).toMatchObject({ 'janus.signIn.code': true, 'user.id': user.id });
		expect(
			spans.findLast((span) => span.name === 'janus.patient.signInCode.confirm')
				?.attributes['janus.signIn.status'],
		).toBe('signedIn');
		const written = JSON.stringify({ spans, logs });
		for (const secret of secrets) expect(written).not.toContain(secret);
	});

	it('leaves the cookie synchronous, and the instance otherwise the same', () => {
		const { auth } = setup();
		expect(typeof auth.cookie.clear()).toBe('string');
		expect(auth.types).toEqual(['patient', 'staff']);
		expect(auth.patient).toBe(auth.patient); // traced once, not per read
		expect(Object.isFrozen(auth)).toBe(true);
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
