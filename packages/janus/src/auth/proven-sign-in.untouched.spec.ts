import { describe, expect, it } from 'bun:test';
import { ada, bearer, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { mailing, signedUp, times } from './mail-requests.fixtures';
import {
	guess,
	throttled,
	signedUp as throttledUser,
} from './sign-in-attempts.fixtures';

/**
 * What `signInProven` leaves as it found it: the throttles, which it neither
 * counts in nor restarts, and the tokens already sent, which it spends none
 * of — the invitation accepted while somebody asks for links in a loop.
 */
describe('signInProven, beside the throttles and the tokens sent', () => {
	it('signs in past the mail throttle, and counts nothing in it', async () => {
		const context = mailing();
		const user = await signedUp(context);
		const { auth } = context;
		const sent = await times(5, () => auth.magicLink.request(ada.email));
		expect(await rejection(auth.magicLink.request(ada.email))).toMatchObject({
			code: 'MAIL_THROTTLED',
		});

		const signedIn = await auth.signInProven(user.id);

		expect(signedIn.status).toBe('signedIn');
		expect(sent).toHaveLength(5);
		expect(context.issued).toEqual(Array(5).fill('magicLink'));
	});

	it('issues no token, so nothing is sent and the window stays whole', async () => {
		const context = mailing();
		const user = await signedUp(context);

		for (let at = 0; at < 10; at += 1) {
			await context.auth.signInProven(user.id);
		}

		expect(context.issued).toEqual([]);
		expect(
			await times(6, () => context.auth.magicLink.request(ada.email)),
		).toEqual([
			...Array(5).fill(expect.anything()),
			{ refused: 'MAIL_THROTTLED' },
		]);
	});

	it('spends no earlier link nor code: both still confirm afterwards', async () => {
		const { auth } = mailing();
		const user = (await auth.signUp({ ...ada, password })).user;
		const link = await auth.magicLink.request(ada.email);
		const code = await auth.signInCode.request(ada.email);
		if (link === null || code === null) throw new Error('expected both');

		await auth.signInProven(user.id);

		const byLink = await auth.magicLink.confirm(link.token);
		const byCode = await auth.signInCode.confirm(code.challenge, code.code);
		expect((await auth.authenticate(bearer(byLink.token)))?.user.id).toBe(
			user.id,
		);
		expect(byCode.user.id).toBe(user.id);
	});

	it('signs in past the sign-in throttle, and neither counts nor restarts it', async () => {
		const context = throttled();
		const user = await throttledUser(context);
		expect(new Set(await guess(context, 11)).has('throttled')).toBe(true);
		const compared = context.compared.count;

		const signedIn = await context.auth.signInProven(user.id);

		expect(signedIn.status).toBe('signedIn');
		expect(context.compared.count).toBe(compared);
		expect(
			await rejection(context.auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID', reason: 'throttled' });
	});
});
