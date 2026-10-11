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
 * What `findByEmail` leaves as it found it: the mail throttle and the
 * sign-in throttle, neither counted in nor restarted — an invitation
 * accepted while somebody asks for links, or guesses passwords, in a loop.
 */
describe('findByEmail, beside the throttles', () => {
	it('finds past the mail throttle, and counts nothing in it', async () => {
		const context = mailing();
		const user = await signedUp(context);
		const { auth } = context;
		await times(5, () => auth.magicLink.request(ada.email));
		expect(await rejection(auth.magicLink.request(ada.email))).toMatchObject({
			code: 'MAIL_THROTTLED',
		});

		expect((await auth.findByEmail(ada.email))?.id).toBe(user.id);
		expect(context.issued).toEqual(Array(5).fill('magicLink'));
	});

	it('leaves the mail count whole: five requests still issue after many lookups', async () => {
		const context = mailing();
		await signedUp(context);

		for (let at = 0; at < 12; at += 1) {
			await context.auth.findByEmail(ada.email);
			await context.auth.findByEmail('nobody@example.test');
		}

		expect(context.issued).toEqual([]);
		for (const address of [ada.email, 'nobody@example.test']) {
			expect(
				await times(6, () => context.auth.magicLink.request(address)),
			).toEqual([
				...Array(5).fill(address === ada.email ? expect.anything() : null),
				{ refused: 'MAIL_THROTTLED' },
			]);
		}
	});

	it('finds past the sign-in throttle, and neither counts nor restarts it', async () => {
		const context = throttled();
		const user = await throttledUser(context);
		expect(new Set(await guess(context, 11)).has('throttled')).toBe(true);

		expect((await context.auth.findByEmail(ada.email))?.id).toBe(user.id);
		expect(
			await rejection(context.auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID', reason: 'throttled' });
	});

	it('leaves the sign-in count whole: ten wrong passwords still pass unthrottled', async () => {
		const context = throttled();
		await throttledUser(context);

		for (let at = 0; at < 12; at += 1) {
			await context.auth.findByEmail(ada.email);
		}

		const reasons = await guess(context, 11);
		expect(reasons.slice(0, 10)).not.toContain('throttled');
		expect(reasons[10]).toBe('throttled');
	});
});
