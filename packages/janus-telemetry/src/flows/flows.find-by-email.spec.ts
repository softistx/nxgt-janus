import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

describe('instrumentJanus()', () => {
	it('traces findByEmail with the user it found, never the address', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });

		const { spans, logs } = await collect(async () => {
			await auth.patient.findByEmail(` ${email.toUpperCase()} `);
			await auth.patient.findByEmail('nobody@example.test');
		});

		const traced = spans.filter(
			(span) => span.name === 'janus.patient.findByEmail',
		);
		expect(traced).toHaveLength(2);
		expect(traced[0]?.attributes).toMatchObject({
			'janus.user.type': 'patient',
			'user.id': user.id,
		});
		expect(traced[1]?.attributes['user.id']).toBeUndefined();
		expect(logs).toEqual([]);
		const written = JSON.stringify({ spans, logs }).toLowerCase();
		expect(written).not.toContain(email);
		expect(written).not.toContain('nobody@example.test');
	});

	it('marks the span failed on an outage, and writes no address', async () => {
		const { auth, outage } = setup();
		await auth.patient.signUp({ email, password });
		outage.on = true;

		const { spans } = await collect(() =>
			rejection(auth.patient.findByEmail(email)),
		);

		const span = spans.find(
			(span) => span.name === 'janus.patient.findByEmail',
		);
		expect(span?.status).toBe('error');
		expect(JSON.stringify(spans)).not.toContain(email);
	});
});
