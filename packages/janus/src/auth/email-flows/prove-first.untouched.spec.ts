import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { mailing, signedUp, times } from '../mail-requests.fixtures';
import {
	guess,
	throttled,
	signedUp as throttledUser,
} from '../sign-in-attempts.fixtures';

/**
 * What `verifyEmail.proveFirst` leaves as it found it: the throttles, which
 * it neither counts in nor restarts, and the e-mail, which it never sends —
 * no token is issued.
 */
describe('verifyEmail.proveFirst, beside the throttles', () => {
	it('proves past the mail throttle, and issues no token', async () => {
		const context = mailing();
		const user = await signedUp(context);
		const { auth } = context;
		await times(5, () => auth.verifyEmail.send(user));
		expect(await rejection(auth.verifyEmail.send(user))).toMatchObject({
			code: 'MAIL_THROTTLED',
		});

		expect((await auth.verifyEmail.proveFirst(user)).proved).toBe(true);
		expect(context.issued).toEqual(Array(5).fill('verifyEmail'));
	});

	it('counts nothing in the mail throttle: the window stays whole', async () => {
		const context = mailing();
		const user = await signedUp(context);

		await context.auth.verifyEmail.proveFirst(user);
		await context.auth.verifyEmail.proveFirst(user);

		expect(context.issued).toEqual([]);
		expect(
			await times(6, () => context.auth.magicLink.request(ada.email)),
		).toEqual([
			...Array(5).fill(expect.anything()),
			{ refused: 'MAIL_THROTTLED' },
		]);
	});

	it('neither counts in the sign-in throttle nor restarts it', async () => {
		const context = throttled();
		const user = await throttledUser(context);
		expect(new Set(await guess(context, 11)).has('throttled')).toBe(true);
		const compared = context.compared.count;

		await context.auth.verifyEmail.proveFirst(user);
		await context.auth.setPassword(user, password);

		expect(context.compared.count).toBe(compared);
		expect(
			await rejection(context.auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID', reason: 'throttled' });
	});
});
