import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

describe('instrumentJanus(), a throttled sign-in', () => {
	it('warns janus.signIn.throttled with the seconds to wait — never the login', async () => {
		const { auth } = setup();
		await auth.patient.signUp({ email, password });
		for (let at = 0; at < 10; at += 1) {
			await rejection(auth.patient.signIn({ email, password: 'wrong horse' }));
		}
		let refusal: unknown;
		const { spans, logs } = await collect(async () => {
			refusal = await rejection(auth.patient.signIn({ email, password }));
		});

		expect(refusal).toMatchObject({ reason: 'throttled' });
		const signIn = spans.find((span) => span.name === 'janus.patient.signIn');
		expect(signIn?.status).toBe('ok');
		const throttled = logs.filter(
			(log) => log.name === 'janus.signIn.throttled',
		);
		expect(throttled).toHaveLength(1);
		expect(throttled[0]?.severity).toBe('warn');
		expect(throttled[0]?.attributes).toMatchObject({
			'janus.refusal': 'CREDENTIALS_INVALID',
			'janus.refusal.reason': 'throttled',
			'janus.user.type': 'patient',
			'janus.signIn.retryAfter': expect.any(Number),
		});
		expect(JSON.stringify(throttled)).not.toContain(email);
		expect(logs.some((log) => log.name === 'janus.signIn.refused')).toBe(false);
	});
});
