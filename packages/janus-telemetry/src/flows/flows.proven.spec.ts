import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup, totp, twoFactor } from './flows.fixtures';

describe('instrumentJanus()', () => {
	it('traces a proven sign-in as a sign-in, marked — never its token', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		let token = '';
		const { spans, logs } = await collect(async () => {
			token = (await auth.patient.signInProven(user.id)).token;
		});

		const span = spans.find(
			(span) => span.name === 'janus.patient.signInProven',
		);
		expect(span?.attributes).toMatchObject({
			'janus.user.type': 'patient',
			'janus.signIn.status': 'signedIn',
			'user.id': user.id,
		});
		expect(logs.map((log) => log.name)).toEqual(['janus.signIn']);
		expect(logs[0]?.attributes).toMatchObject({
			'janus.signIn.proven': true,
			'user.id': user.id,
		});
		const written = JSON.stringify({ spans, logs });
		expect(written).not.toContain(token);
		expect(written).not.toContain(email);
	});

	it('writes a refusal marked, and leaves the span ok', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		await auth.patient.setActive(user, false);

		const { spans, logs } = await collect(() =>
			rejection(auth.patient.signInProven(user.id)),
		);

		expect(
			spans.find((span) => span.name === 'janus.patient.signInProven')?.status,
		).toBe('ok');
		expect(logs.map((log) => log.name)).toEqual(['janus.signIn.refused']);
		expect(logs[0]?.attributes).toMatchObject({
			'janus.refusal': 'USER_INACTIVE',
			'janus.signIn.proven': true,
			'user.id': user.id,
		});
	});

	it('writes the second factor asked for, when the proof opens no session', async () => {
		const auth = twoFactor();
		const { user } = await auth.signUp({ email, password });
		const { secret } = await auth.secondFactor.enroll(user);
		await auth.secondFactor.activate(user, totp(secret, Date.now()));

		const { spans, logs } = await collect(() => auth.signInProven(user.id));

		expect(logs.map((log) => log.name)).toEqual(['janus.signIn.secondFactor']);
		expect(
			spans.find((span) => span.name === 'janus.signInProven')?.attributes[
				'janus.signIn.status'
			],
		).toBe('secondFactor');
	});
});
