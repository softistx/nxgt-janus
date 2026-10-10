import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

describe('instrumentJanus(), a request past its e-mails', () => {
	it('warns janus.mail.throttled with the flow and the seconds to wait — never the address', async () => {
		const { auth } = setup();
		for (let at = 0; at < 5; at += 1) {
			await auth.patient.magicLink.request(email);
		}
		let refusal: unknown;
		const { spans, logs } = await collect(async () => {
			refusal = await rejection(auth.patient.magicLink.request(email));
		});

		expect(refusal).toMatchObject({ code: 'MAIL_THROTTLED' });
		const request = spans.find(
			(span) => span.name === 'janus.patient.magicLink.request',
		);
		// A refusal is an answer: the span is ok.
		expect(request?.status).toBe('ok');
		const throttled = logs.filter((log) => log.name === 'janus.mail.throttled');
		expect(throttled).toHaveLength(1);
		expect(throttled[0]?.severity).toBe('warn');
		expect(throttled[0]?.attributes).toMatchObject({
			'janus.refusal': 'MAIL_THROTTLED',
			'janus.user.type': 'patient',
			'janus.mail.flow': 'magicLink.request',
			'janus.mail.retryAfter': expect.any(Number),
		});
		expect(JSON.stringify(throttled)).not.toContain(email);
	});

	it('names the user of a request made for one: verifyEmail.send', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		for (let at = 0; at < 5; at += 1) {
			await auth.patient.verifyEmail.send(user);
		}
		const { logs } = await collect(async () => {
			await rejection(auth.patient.verifyEmail.send(user));
		});

		const throttled = logs.filter((log) => log.name === 'janus.mail.throttled');
		expect(throttled[0]?.attributes).toMatchObject({
			'janus.refusal': 'MAIL_THROTTLED',
			'janus.mail.flow': 'verifyEmail.send',
			'user.id': user.id,
		});
	});

	it('writes nothing for a request under the limit, issued or not', async () => {
		const { auth } = setup();
		const { logs } = await collect(async () => {
			await auth.patient.resetPassword.request('nobody@example.test');
		});

		expect(logs.some((log) => log.name === 'janus.mail.throttled')).toBe(false);
	});
});
