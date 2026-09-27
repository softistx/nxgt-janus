import { describe, expect, it } from 'bun:test';
import { ada, bearer, password, rejection } from '../../../test/auth';
import { challenged, enrolled, setup } from './flows.fixtures';

describe('signIn with a second factor', () => {
	it('answers a challenge instead of a session', async () => {
		const context = setup();
		const { user } = await enrolled(context);
		const now = context.clock.now().getTime();

		const result = await context.auth.signIn({ email: ada.email, password });

		expect(result).toEqual({
			status: 'secondFactor',
			challenge: expect.any(String),
			expiresAt: new Date(now + 5 * 60_000),
			userId: user.id,
		});
		expect(Object.keys(result)).not.toContain('token');
	});

	it('opens the session once the code matches, and spends the challenge', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret } = await enrolled(context);
		const challenge = await challenged(auth);

		const signedIn = await auth.secondFactor.confirm(challenge, codeOf(secret));

		expect(signedIn.status).toBe('signedIn');
		expect(signedIn.user.hasSecondFactor).toBe(true);
		expect((await auth.authenticate(bearer(signedIn.token)))?.user.id).toBe(
			signedIn.user.id,
		);
		context.clock.advance(30_000);
		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('accepts a code once: a replay on a new challenge is refused', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret } = await enrolled(context);
		const code = codeOf(secret);
		await auth.secondFactor.confirm(await challenged(auth), code);

		const replayed = await rejection(
			auth.secondFactor.confirm(await challenged(auth), code),
		);

		expect(replayed).toMatchObject({ code: 'CODE_INVALID', attemptsLeft: 4 });
	});

	it('takes five attempts, then spends the challenge', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		const challenge = await challenged(auth);
		const right = codeOf(secret);
		const wrong = right === '000000' ? '111111' : '000000';

		for (const attemptsLeft of [4, 3, 2, 1, 0]) {
			expect(
				await rejection(auth.secondFactor.confirm(challenge, wrong)),
			).toMatchObject({ code: 'CODE_INVALID', attemptsLeft, userId: user.id });
		}
		expect(
			await rejection(auth.secondFactor.confirm(challenge, right)),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('counts every call, a malformed code included', async () => {
		const context = setup();
		const { auth } = context;
		await enrolled(context);
		const challenge = await challenged(auth);

		expect(
			await rejection(auth.secondFactor.confirm(challenge, 'abc')),
		).toMatchObject({ code: 'CODE_INVALID', attemptsLeft: 4 });
	});

	it('refuses an unknown or a lapsed challenge', async () => {
		const context = setup();
		const { auth, clock, codeOf } = context;
		const { secret } = await enrolled(context);

		expect(
			await rejection(auth.secondFactor.confirm('nope', codeOf(secret))),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });

		const challenge = await challenged(auth);
		clock.advance(5 * 60_000);
		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'TOKEN_EXPIRED' });
	});

	it('refuses a user deactivated since, and spends the challenge', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		const challenge = await challenged(auth);
		await auth.setActive(user, false);

		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'USER_INACTIVE' });
		await auth.setActive(user, true);
		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('refuses a factor disabled since the challenge', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		const challenge = await challenged(auth);
		await auth.secondFactor.disable(user);

		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'SECOND_FACTOR_NOT_ENROLLED' });
	});

	it('lets one of two concurrent confirmations with the same code through', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret } = await enrolled(context);
		const code = codeOf(secret);
		const challenges = [await challenged(auth), await challenged(auth)];

		const outcomes = await Promise.allSettled(
			challenges.map((challenge) => auth.secondFactor.confirm(challenge, code)),
		);

		expect(
			outcomes.filter((outcome) => outcome.status === 'fulfilled'),
		).toHaveLength(1);
	});
});
