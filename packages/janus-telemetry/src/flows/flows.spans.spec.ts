import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

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
});
