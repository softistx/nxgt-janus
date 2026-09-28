import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { challenged, enrolled, setup } from './flows.fixtures';

describe('secondFactor.regenerateRecoveryCodes', () => {
	it('answers ten new codes on a fresh code from the app, and the old ones stop working', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { recoveryCodes, secret, user } = await enrolled(context);

		const fresh = await auth.secondFactor.regenerateRecoveryCodes(
			user,
			codeOf(secret),
		);

		expect(fresh.user).toMatchObject({ id: user.id, hasSecondFactor: true });
		expect(fresh.recoveryCodes).toHaveLength(10);
		expect(fresh.recoveryCodes).not.toContain(recoveryCodes[0]);
		expect(
			await rejection(
				auth.secondFactor.recover(
					await challenged(auth),
					recoveryCodes[0] ?? '',
				),
			),
		).toMatchObject({ code: 'CODE_INVALID' });
		const signedIn = await auth.secondFactor.recover(
			await challenged(auth),
			fresh.recoveryCodes[0] ?? '',
		);
		expect(signedIn.recoveryCodesLeft).toBe(9);
	});

	it("spends the app's code: the same code cannot regenerate twice, nor sign in", async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		const code = codeOf(secret);
		await auth.secondFactor.regenerateRecoveryCodes(user, code);

		expect(
			await rejection(auth.secondFactor.regenerateRecoveryCodes(user, code)),
		).toMatchObject({ code: 'CODE_INVALID', attemptsLeft: 4 });
		expect(
			await rejection(auth.secondFactor.confirm(await challenged(auth), code)),
		).toMatchObject({ code: 'CODE_INVALID' });
	});

	it('refuses a user with no active factor: none, or one still waiting', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { user } = await auth.signUp({ ...ada, password });

		expect(
			await rejection(
				auth.secondFactor.regenerateRecoveryCodes(user, '000000'),
			),
		).toMatchObject({
			code: 'SECOND_FACTOR_NOT_ENROLLED',
			message:
				'secondFactor.regenerateRecoveryCodes: the user has no active second factor — recovery codes come with one',
		});
		const { secret } = await auth.secondFactor.enroll(user);
		expect(
			await rejection(
				auth.secondFactor.regenerateRecoveryCodes(user, codeOf(secret)),
			),
		).toMatchObject({ code: 'SECOND_FACTOR_NOT_ENROLLED' });
	});

	it('writes under ifVersion, like every write that follows a read', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		const current = await auth.get(user.id);

		expect(
			await rejection(
				auth.secondFactor.regenerateRecoveryCodes(user, codeOf(secret), {
					ifVersion: current.version - 1,
				}),
			),
		).toMatchObject({ code: 'VERSION_CONFLICT' });
	});
});
