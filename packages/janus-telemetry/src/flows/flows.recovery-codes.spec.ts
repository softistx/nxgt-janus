import { describe, expect, it } from 'bun:test';
import { collect, rejection } from '../../test/collect';
import { email, password, totp, twoFactor } from './flows.fixtures';

describe('instrumentJanus()', () => {
	it('writes a sign-in by recovery code and a regeneration, with no code in any signal', async () => {
		const auth = twoFactor();
		const secrets: string[] = [];
		let id = '';
		const { logs, all } = await collect(async () => {
			const { user } = await auth.signUp({ email, password });
			id = user.id;
			const { secret } = await auth.secondFactor.enroll(user);
			const first = totp(secret, Date.now());
			const { recoveryCodes } = await auth.secondFactor.activate(user, first);
			const asked = await auth.signIn({ email, password });
			if (asked.status !== 'secondFactor')
				throw new Error('expected a challenge');
			await rejection(
				auth.secondFactor.recover(asked.challenge, 'zzzzz-zzzzz'),
			);
			const signedIn = await auth.secondFactor.recover(
				asked.challenge,
				recoveryCodes[0] ?? '',
			);
			const next = totp(secret, Date.now() + 30_000);
			const fresh = await auth.secondFactor.regenerateRecoveryCodes(user, next);
			secrets.push(
				...recoveryCodes,
				...recoveryCodes.map((code) => code.replace('-', '')),
				...fresh.recoveryCodes,
				asked.challenge,
				signedIn.token,
			);
		});

		const byCode = logs.filter(
			(log) => log.attributes['janus.signIn.recoveryCode'] === true,
		);
		expect(byCode.map((log) => [log.name, log.attributes])).toEqual([
			[
				'janus.signIn.refused',
				expect.objectContaining({
					'janus.refusal': 'CODE_INVALID',
					'janus.secondFactor.attemptsLeft': 4,
					'user.id': id,
				}),
			],
			[
				'janus.signIn',
				expect.objectContaining({
					'janus.secondFactor.recoveryCodesLeft': 9,
					'user.id': id,
				}),
			],
		]);
		expect(
			logs.find(
				(log) => log.name === 'janus.secondFactor.recoveryCodesRegenerated',
			)?.attributes,
		).toEqual({ 'janus.user.type': 'user', 'user.id': id });
		const written = JSON.stringify(all);
		for (const secret of secrets) expect(written).not.toContain(secret);
	});
});
