import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, setup, totp, twoFactor } from './flows.fixtures';

describe('instrumentJanus()', () => {
	it('writes a sign-in link sent, confirmed and refused — never its token', async () => {
		const { auth } = setup();
		const { user } = await auth.patient.signUp({ email, password });
		const secrets: string[] = [];
		const { spans, logs } = await collect(async () => {
			expect(
				await auth.patient.magicLink.request('nobody@example.test'),
			).toBeNull();
			const stale = await auth.patient.magicLink.request(email);
			const issued = await auth.patient.magicLink.request(email);
			if (stale === null || issued === null) throw new Error('expected links');
			await rejection(auth.patient.magicLink.confirm(stale.token));
			const signedIn = await auth.patient.magicLink.confirm(issued.token);
			secrets.push(stale.token, issued.token, signedIn.token);
		});

		const sent = logs.filter((log) => log.name === 'janus.magicLink.sent');
		expect(sent.map((log) => log.attributes['user.id'])).toEqual([
			user.id,
			user.id,
		]);
		expect(
			logs.find((log) => log.name === 'janus.signIn.refused')?.attributes,
		).toMatchObject({
			'janus.refusal': 'TOKEN_SPENT',
			'janus.signIn.magicLink': true,
		});
		expect(
			logs.find((log) => log.name === 'janus.signIn')?.attributes,
		).toMatchObject({ 'janus.signIn.magicLink': true, 'user.id': user.id });
		expect(
			spans.findLast((span) => span.name === 'janus.patient.magicLink.confirm')
				?.attributes['janus.signIn.status'],
		).toBe('signedIn');
		const written = JSON.stringify({ spans, logs });
		for (const secret of secrets) expect(written).not.toContain(secret);
		expect(written).not.toContain(email);
	});

	it('writes the second factor asked for, when the link opens no session', async () => {
		const auth = twoFactor();
		const { user } = await auth.signUp({ email, password });
		const { secret } = await auth.secondFactor.enroll(user);
		await auth.secondFactor.activate(user, totp(secret, Date.now()));
		const issued = await auth.magicLink.request(email);
		if (issued === null) throw new Error('expected a link');

		const { spans, logs } = await collect(() =>
			auth.magicLink.confirm(issued.token),
		);

		expect(logs.map((log) => log.name)).toEqual(['janus.signIn.secondFactor']);
		expect(
			spans.find((span) => span.name === 'janus.magicLink.confirm')?.attributes[
				'janus.signIn.status'
			],
		).toBe('secondFactor');
	});
});
