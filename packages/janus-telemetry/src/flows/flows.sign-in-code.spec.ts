import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup } from './flows.fixtures';

describe('instrumentJanus()', () => {
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
});
