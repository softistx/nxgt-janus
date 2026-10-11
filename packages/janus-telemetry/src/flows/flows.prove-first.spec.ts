import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

describe('instrumentJanus()', () => {
	it('traces verifyEmail.proveFirst with its user, and writes janus.email.verified once it proved', async () => {
		const { auth } = setup();
		const { user, token } = await auth.patient.signUp({ email, password });

		const { spans, logs } = await collect(async () => {
			await auth.patient.verifyEmail.proveFirst(user.id);
			await auth.patient.verifyEmail.proveFirst(user.id);
		});

		const traced = spans.filter(
			(span) => span.name === 'janus.patient.verifyEmail.proveFirst',
		);
		expect(traced).toHaveLength(2);
		expect(traced[0]?.attributes).toMatchObject({
			'janus.user.type': 'patient',
			'user.id': user.id,
		});
		// The second call found the e-mail proved: nothing changed, nothing written.
		expect(logs.map((log) => log.name)).toEqual(['janus.email.verified']);
		expect(logs[0]?.attributes).toMatchObject({
			'janus.email.proveFirst': true,
			'janus.user.type': 'patient',
			'user.id': user.id,
		});
		const written = JSON.stringify({ spans, logs });
		expect(written).not.toContain(email);
		expect(written).not.toContain(token);
	});

	it('writes nothing for a refusal, and leaves the span ok', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		await auth.patient.setActive(user, false);

		const { spans, logs } = await collect(() =>
			rejection(auth.patient.verifyEmail.proveFirst(user.id)),
		);

		expect(
			spans.find((span) => span.name === 'janus.patient.verifyEmail.proveFirst')
				?.status,
		).toBe('ok');
		expect(logs).toEqual([]);
	});
});
