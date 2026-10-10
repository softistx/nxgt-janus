import { describe, expect, it } from 'bun:test';
import { ada, bearer, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import {
	type Mailing,
	mailing,
	signedUp,
	times,
	WINDOW_MS,
} from './mail-requests.fixtures';

/**
 * The owner's guarantee: a refused request spends, invalidates and rotates
 * nothing, so the last link or code sent — the one in the victim's inbox
 * when somebody else asked in a loop — still confirms. Asked for at the start
 * of a window, refused at its last second: the worst case under the default
 * lifetimes, none shorter than the default window.
 */

/** Five sent at the window's start, then one refused at its last second. */
async function lastOfFive<T>(
	{ clock }: Mailing,
	request: () => Promise<T>,
): Promise<T> {
	const sent = await times(5, request);
	clock.advance(WINDOW_MS - 1_000);
	expect(await rejection(request())).toMatchObject({ code: 'MAIL_THROTTLED' });
	return sent[4] as T;
}

describe('past the limit, the last one sent still confirms', () => {
	it('magicLink: the last link signs in', async () => {
		const context = mailing();
		await signedUp(context);
		const last = await lastOfFive(context, () =>
			context.auth.magicLink.request(ada.email),
		);

		const result = await context.auth.magicLink.confirm(last?.token ?? '');
		expect(result.status).toBe('signedIn');
	});

	it('signInCode: the last code signs in, its challenge unspent', async () => {
		const context = mailing();
		await signedUp(context);
		const last = await lastOfFive(context, () =>
			context.auth.signInCode.request(ada.email),
		);

		const result = await context.auth.signInCode.confirm(
			last?.challenge ?? '',
			last?.code ?? '',
		);
		expect(result.status).toBe('signedIn');
	});

	it('resetPassword: the last link resets the password', async () => {
		const context = mailing();
		await signedUp(context);
		const last = await lastOfFive(context, () =>
			context.auth.resetPassword.request(ada.email),
		);

		await context.auth.resetPassword.confirm(
			last?.token ?? '',
			'new password!',
		);
		await context.auth.signIn({ email: ada.email, password: 'new password!' });
	});

	it('verifyEmail: the last link verifies the e-mail', async () => {
		const context = mailing();
		const user = await signedUp(context);
		const last = await lastOfFive(context, () =>
			context.auth.verifyEmail.send(user),
		);

		const verified = await context.auth.verifyEmail.confirm(last.token);
		expect(verified.emailVerified).toBe(true);
	});

	it('stepUp: the last code confirms the session', async () => {
		const context = mailing();
		await signedUp(context);
		const signed = await context.auth.signIn({ email: ada.email, password });
		const last = await lastOfFive(context, () =>
			context.auth.stepUp.request(signed.user),
		);

		const session = await context.auth.stepUp.confirm(
			bearer(signed.token),
			last.challenge,
			last.code,
		);
		expect(session.id).toBe(signed.session.id);
	});
});
