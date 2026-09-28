import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { challenged, enrolled, setup } from './flows.fixtures';
import { REGENERATE_WINDOW_MS } from './regenerate-attempts';

const TOO_MANY =
	'secondFactor.regenerateRecoveryCodes: too many codes tried — wait for the next 15-minute window';

/** Tries `count` wrong codes, and answers what each refusal left. */
async function guess(
	context: ReturnType<typeof setup>,
	user: { readonly id: string },
	secret: string,
	count: number,
): Promise<unknown[]> {
	const left: unknown[] = [];
	for (let at = 0; at < count; at += 1) {
		const error = await rejection(
			context.auth.secondFactor.regenerateRecoveryCodes(
				user,
				context.wrongCodeOf(secret),
			),
		);
		expect(error).toMatchObject({ code: 'CODE_INVALID' });
		left.push((error as { attemptsLeft?: number }).attemptsLeft);
	}
	return left;
}

describe('secondFactor.regenerateRecoveryCodes, attempts', () => {
	it('refuses every call after five wrong codes, the right one included, and writes nothing', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		const before = await auth.get(user.id);

		expect(await guess(context, user, secret, 5)).toEqual([4, 3, 2, 1, 0]);
		const refused = await rejection(
			auth.secondFactor.regenerateRecoveryCodes(user, codeOf(secret)),
		);

		expect(refused).toMatchObject({
			code: 'CODE_INVALID',
			attemptsLeft: 0,
			message: TOO_MANY,
			userId: user.id,
		});
		expect((await auth.get(user.id)).version).toBe(before.version);
	});

	it('counts again once the window ends', async () => {
		const context = setup();
		const { auth, clock, codeOf } = context;
		const { secret, user } = await enrolled(context);
		await guess(context, user, secret, 5);

		clock.advance(REGENERATE_WINDOW_MS);
		const fresh = await auth.secondFactor.regenerateRecoveryCodes(
			user,
			codeOf(secret),
		);

		expect(fresh.recoveryCodes).toHaveLength(10);
	});

	it('starts the count again after a regenerate that succeeded', async () => {
		const context = setup();
		const { auth, clock, codeOf } = context;
		const { secret, user } = await enrolled(context);
		expect(await guess(context, user, secret, 4)).toEqual([4, 3, 2, 1]);

		await auth.secondFactor.regenerateRecoveryCodes(user, codeOf(secret));
		clock.advance(30_000);

		expect(await guess(context, user, secret, 5)).toEqual([4, 3, 2, 1, 0]);
		expect(
			await rejection(
				auth.secondFactor.regenerateRecoveryCodes(user, codeOf(secret)),
			),
		).toMatchObject({ message: TOO_MANY });
	});

	it('starts it again after a sign-in finished with the app, which accepted a code', async () => {
		const context = setup();
		const { auth, clock, codeOf } = context;
		const { secret, user } = await enrolled(context);
		await guess(context, user, secret, 5);

		await auth.secondFactor.confirm(await challenged(auth), codeOf(secret));
		clock.advance(30_000);

		expect(await guess(context, user, secret, 1)).toEqual([4]);
	});

	it('counts per user: another user of the same instance keeps their five', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		await guess(context, user, secret, 5);

		const { user: other } = await auth.signUp({
			...ada,
			email: 'grace@example.test',
			password,
		});
		const enrolment = await auth.secondFactor.enroll(other);
		await auth.secondFactor.activate(other, codeOf(enrolment.secret));

		expect(await guess(context, other, enrolment.secret, 1)).toEqual([4]);
	});

	it('buys no attempt with a password written between guesses', async () => {
		const context = setup();
		const { auth } = context;
		const { secret, user } = await enrolled(context);
		expect(await guess(context, user, secret, 3)).toEqual([4, 3, 2]);

		await auth.setPassword(user, 'another horse');
		expect(await guess(context, user, secret, 2)).toEqual([1, 0]);
		await auth.setPassword(user, 'a third horse');

		expect(
			await rejection(
				auth.secondFactor.regenerateRecoveryCodes(
					user,
					context.wrongCodeOf(secret),
				),
			),
		).toMatchObject({ attemptsLeft: 0, message: TOO_MANY });
	});
});
