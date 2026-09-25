import { describe, expect, it } from 'bun:test';
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

	it('leaves the cookie synchronous, and the instance otherwise the same', () => {
		const { auth } = setup();
		expect(typeof auth.cookie.clear()).toBe('string');
		expect(auth.types).toEqual(['patient', 'staff']);
		expect(auth.patient).toBe(auth.patient); // traced once, not per read
		expect(Object.isFrozen(auth)).toBe(true);
	});
});
