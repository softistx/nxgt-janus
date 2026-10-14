import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

describe('instrumentJanus()', () => {
	it('traces findOrCreate, never writing the key', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		const other = 'newcomer@example.test';

		const { spans, logs } = await collect(async () => {
			await auth.patient.findOrCreate(email, () => ({ email }));
			await auth.patient.findOrCreate(other, () => ({
				email: other,
				password,
			}));
		});

		const traced = spans.filter(
			(span) => span.name === 'janus.patient.findOrCreate',
		);
		expect(traced).toHaveLength(2);
		expect(traced[0]?.attributes).toMatchObject({
			'janus.user.type': 'patient',
		});
		expect(traced[0]?.status).not.toBe('error');
		expect(logs).toEqual([]);
		const written = JSON.stringify({ spans, logs }).toLowerCase();
		expect(written).not.toContain(email);
		expect(written).not.toContain(other);
		expect(user.id).toBeDefined();
	});

	it('marks the span failed on an outage, and writes no key', async () => {
		const { auth, outage } = setup();
		outage.on = true;

		const { spans } = await collect(() =>
			rejection(auth.patient.findOrCreate(email, () => ({ email }))),
		);

		const span = spans.find(
			(span) => span.name === 'janus.patient.findOrCreate',
		);
		expect(span?.status).toBe('error');
		expect(JSON.stringify(spans)).not.toContain(email);
	});
});
