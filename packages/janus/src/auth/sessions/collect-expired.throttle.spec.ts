import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { mailing, signedUp as mailSignedUp } from '../mail-requests.fixtures';
import {
	guess,
	signedUp,
	throttled,
	WINDOW_MS,
} from '../sign-in-attempts.fixtures';

/**
 * The throttles' counts are ordinary one-time tokens, so collecting the lapsed
 * ones must keep a count while its window lasts and drop it once it lapsed.
 */
describe('collectExpired, and the throttles', () => {
	it('keeps the sign-in throttle while its counts stand, and starts from zero once they lapsed', async () => {
		const context = throttled();
		const { auth, clock } = context;
		await signedUp(context);
		await guess(context, 10);

		await auth.collectExpired();
		expect(await guess(context, 1)).toEqual(['throttled']);

		clock.advance(2 * WINDOW_MS);
		expect(await auth.collectExpired()).toBeGreaterThan(0);
		expect(await guess(context, 10)).not.toContain('throttled');
		expect(await guess(context, 1)).toEqual(['throttled']);
		const signedIn = await auth.signIn({ email: ada.email, password }).then(
			() => 'signed in',
			(error: unknown) => (error as { reason?: unknown }).reason,
		);
		expect(signedIn).toBe('throttled');
	});

	it('leaves the last link of a throttled mail request redeemable after a collect inside its window', async () => {
		const context = mailing();
		await mailSignedUp(context);
		const { auth } = context;
		let last: Awaited<ReturnType<typeof auth.magicLink.request>> | undefined;
		for (let sent = 0; sent < 5; sent += 1) {
			last = await auth.magicLink.request(ada.email);
		}
		expect(await rejection(auth.magicLink.request(ada.email))).toMatchObject({
			code: 'MAIL_THROTTLED',
		});

		await auth.collectExpired();

		expect(await rejection(auth.magicLink.request(ada.email))).toMatchObject({
			code: 'MAIL_THROTTLED',
		});
		const link = last as { token?: string } | undefined;
		const result = await auth.magicLink.confirm(link?.token ?? '');
		expect(result.status).toBe('signedIn');
	});
});
