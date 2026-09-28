import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

describe('instrumentJanus()', () => {
	it('writes a step-up asked, confirmed and refused, with the user — never the code, the challenge or the token', async () => {
		const { auth } = setup();
		await auth.patient.signUp({ email, password });
		const signed = await auth.patient.signIn({ email, password });
		const request = new Headers({ authorization: `Bearer ${signed.token}` });
		const secrets: string[] = [signed.token];
		const { spans, logs } = await collect(async () => {
			const issued = await auth.patient.stepUp.request(signed.user);
			const wrong = issued.code === '000000' ? '111111' : '000000';
			await rejection(
				auth.patient.stepUp.confirm(request, issued.challenge, wrong),
			);
			await auth.patient.stepUp.confirm(request, issued.challenge, issued.code);
			secrets.push(issued.code, issued.challenge);
		});

		expect(
			logs.find((log) => log.name === 'janus.stepUp.asked')?.attributes,
		).toMatchObject({
			'janus.stepUp.via': 'email',
			'user.id': signed.user.id,
		});
		expect(
			logs.find((log) => log.name === 'janus.stepUp.refused')?.attributes,
		).toMatchObject({
			'janus.refusal': 'CODE_INVALID',
			'janus.secondFactor.attemptsLeft': 4,
		});
		expect(
			logs.find((log) => log.name === 'janus.stepUp.confirmed')?.attributes,
		).toMatchObject({
			'janus.user.type': 'patient',
			'user.id': signed.user.id,
		});
		expect(
			spans.findLast((span) => span.name === 'janus.patient.stepUp.confirm')
				?.attributes['user.id'],
		).toBe(signed.user.id);
		const written = JSON.stringify({ spans, logs });
		for (const secret of secrets) expect(written).not.toContain(secret);
	});
});
