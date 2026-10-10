import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { enrolled, setup } from '../../test/second-factor';
import {
	byUser,
	mailing,
	signedUp,
	times,
	WINDOW_MS,
} from './mail-requests.fixtures';

describe('verifyEmail.send, throttled per user', () => {
	it('sends five, then refuses with MAIL_THROTTLED, retryAfter and the user, issuing nothing', async () => {
		const context = mailing();
		const { auth, issued } = context;
		const user = await signedUp(context);

		await times(5, () => auth.verifyEmail.send(user));
		const refused = await rejection(auth.verifyEmail.send(user));

		expect(refused).toMatchObject({
			code: 'MAIL_THROTTLED',
			retryAfter: 900,
			userId: user.id,
			userType: 'user',
			message: byUser('verifyEmail.send'),
		});
		expect(issued).toEqual(Array.from({ length: 5 }, () => 'verifyEmail'));
	});

	it('sends again once the window ends', async () => {
		const context = mailing();
		const { auth, clock } = context;
		const user = await signedUp(context);
		await times(6, () => auth.verifyEmail.send(user));

		clock.advance(WINDOW_MS);

		expect((await auth.verifyEmail.send(user)).email).toBe(ada.email);
	});

	it('counts the user, not the address: a new e-mail buys no more', async () => {
		const context = mailing();
		const { auth } = context;
		const user = await signedUp(context);
		await times(5, () => auth.verifyEmail.send(user));
		await auth.update(user, { email: 'countess@example.test' });

		expect(await rejection(auth.verifyEmail.send(user))).toMatchObject({
			code: 'MAIL_THROTTLED',
		});
	});

	it('is left alone by a loop on the address', async () => {
		const context = mailing();
		const { auth } = context;
		const user = await signedUp(context);
		await times(6, () => auth.magicLink.request(ada.email));
		await times(6, () => auth.resetPassword.request(ada.email));

		expect((await auth.verifyEmail.send(user)).email).toBe(ada.email);
		expect((await auth.stepUp.request(user)).via).toBe('email');
	});
});

describe('stepUp.request, throttled per user', () => {
	it('e-mails five codes, then refuses with MAIL_THROTTLED, issuing nothing', async () => {
		const context = mailing();
		const { auth, issued } = context;
		const user = await signedUp(context);

		await times(5, () => auth.stepUp.request(user));
		const refused = await rejection(auth.stepUp.request(user));

		expect(refused).toMatchObject({
			code: 'MAIL_THROTTLED',
			retryAfter: 900,
			userId: user.id,
			message: byUser('stepUp.request'),
		});
		expect(issued).toEqual(Array.from({ length: 5 }, () => 'stepUp'));
	});

	it('counts nothing for a challenge the app confirms: nothing is e-mailed', async () => {
		const context = setup();
		const { user } = await enrolled(context);
		await context.auth.signIn({ email: ada.email, password });

		const asked = await times(8, () => context.auth.stepUp.request(user));

		expect(asked.map((answer) => 'via' in answer && answer.via)).toEqual(
			Array.from({ length: 8 }, () => 'secondFactor'),
		);
	});
});
