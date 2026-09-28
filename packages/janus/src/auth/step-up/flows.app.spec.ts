import { describe, expect, it } from 'bun:test';
import { ada, bearer, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { enrolled, setup } from '../../../test/second-factor';

/** Ada with an active factor, signed in with her app: the session to confirm. */
async function signedInWithApp(context: ReturnType<typeof setup>) {
	const { auth, codeOf } = context;
	const factor = await enrolled(context);
	const result = await auth.signIn({ email: ada.email, password });
	if (result.status !== 'secondFactor') throw new Error('expected a challenge');
	const signed = await auth.secondFactor.confirm(
		result.challenge,
		codeOf(factor.secret),
	);
	// That step's code is used: the next one is a new step.
	context.clock.advance(30_000);
	return { ...factor, request: bearer(signed.token), session: signed.session };
}

describe('stepUp with an active second factor', () => {
	it('asks the app for a code, sends nothing, and stamps the session', async () => {
		const context = setup();
		const { auth, clock, codeOf } = context;
		const { user, secret, request, session } = await signedInWithApp(context);

		const issued = await auth.stepUp.request(user);
		expect(issued.via).toBe('secondFactor');
		expect('code' in issued).toBe(false);
		expect('email' in issued).toBe(false);

		const confirmed = await auth.stepUp.confirm(
			request,
			issued.challenge,
			codeOf(secret),
		);
		expect(confirmed.id).toBe(session.id);
		expect(confirmed.authenticatedAt).toEqual(clock.now());
	});

	it('spends the app’s code: it confirms nothing else in its step', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { user, secret, request } = await signedInWithApp(context);
		const first = await auth.stepUp.request(user);
		await auth.stepUp.confirm(request, first.challenge, codeOf(secret));

		const second = await auth.stepUp.request(user);
		expect(
			await rejection(
				auth.stepUp.confirm(request, second.challenge, codeOf(secret)),
			),
		).toMatchObject({ code: 'CODE_INVALID' });
	});

	it('counts the app’s codes per user and window, across challenges', async () => {
		const context = setup();
		const { auth, codeOf, wrongCodeOf } = context;
		const { user, secret, request } = await signedInWithApp(context);

		const left: unknown[] = [];
		for (let at = 0; at < 5; at += 1) {
			// A new challenge each time: five attempts of its own, but not of the window.
			const issued = await auth.stepUp.request(user);
			const error = await rejection(
				auth.stepUp.confirm(request, issued.challenge, wrongCodeOf(secret)),
			);
			left.push((error as { attemptsLeft?: number }).attemptsLeft);
		}
		expect(left).toEqual([4, 3, 2, 1, 0]);

		const issued = await auth.stepUp.request(user);
		expect(
			await rejection(
				auth.stepUp.confirm(request, issued.challenge, codeOf(secret)),
			),
		).toMatchObject({ code: 'CODE_INVALID', attemptsLeft: 0 });
	});

	it('refuses an e-mailed code once the factor became active since it was sent', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		await auth.signUp({ ...ada, password });
		const signed = await auth.signIn({ email: ada.email, password });
		if (signed.status !== 'signedIn') throw new Error('expected a session');
		const issued = await auth.stepUp.request(signed.user);
		if (issued.via !== 'email') throw new Error('expected an e-mailed code');

		const { secret } = await auth.secondFactor.enroll(signed.user);
		await auth.secondFactor.activate(signed.user, codeOf(secret));

		expect(
			await rejection(
				auth.stepUp.confirm(
					bearer(signed.token),
					issued.challenge,
					issued.code,
				),
			),
		).toMatchObject({ code: 'SECOND_FACTOR_ACTIVE' });
	});

	it('refuses the app’s challenge once the factor was disabled since', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { user, secret, request } = await signedInWithApp(context);
		const issued = await auth.stepUp.request(user);
		await auth.secondFactor.disable(user);

		expect(
			await rejection(
				auth.stepUp.confirm(request, issued.challenge, codeOf(secret)),
			),
		).toMatchObject({ code: 'SECOND_FACTOR_NOT_ENROLLED' });
	});

	it('accepts one of two confirmations sent at once with the same code', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { user, secret, request } = await signedInWithApp(context);
		const issued = await auth.stepUp.request(user);
		const code = codeOf(secret);

		const outcomes = await Promise.allSettled([
			auth.stepUp.confirm(request, issued.challenge, code),
			auth.stepUp.confirm(request, issued.challenge, code),
		]);
		expect(outcomes.filter((one) => one.status === 'fulfilled')).toHaveLength(
			1,
		);
		const refused = outcomes.find((one) => one.status === 'rejected');
		expect(refused?.status === 'rejected' && refused.reason).toMatchObject({
			code: 'VERSION_CONFLICT',
		});
	});
});
