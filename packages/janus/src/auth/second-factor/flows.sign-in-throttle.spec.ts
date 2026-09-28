import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { challenged, enrolled, setup } from '../../../test/second-factor';

/** Signs in with the right password `count` times, and answers the challenges. */
async function challenges(
	auth: ReturnType<typeof setup>['auth'],
	count: number,
): Promise<string[]> {
	const issued: string[] = [];
	for (let at = 0; at < count; at += 1) issued.push(await challenged(auth));
	return issued;
}

describe('signIn, throttled, with a second factor', () => {
	it('counts the right password that only opens a challenge: it buys no more than ten', async () => {
		const context = setup();
		const { auth } = context;
		await enrolled(context);

		await challenges(auth, 10);
		const refused = await rejection(
			auth.signIn({ email: ada.email, password }),
		);

		expect(refused).toMatchObject({
			code: 'CREDENTIALS_INVALID',
			reason: 'throttled',
		});
	});

	it('starts the count again once the code opens the session', async () => {
		const context = setup();
		const { auth, clock, codeOf } = context;
		const { secret } = await enrolled(context);

		const [last] = (await challenges(auth, 10)).slice(-1);
		await auth.secondFactor.confirm(last as string, codeOf(secret));
		clock.advance(30_000);

		expect(await challenges(auth, 10)).toHaveLength(10);
	});

	it('starts the count again once a recovery code opens the session', async () => {
		const context = setup();
		const { auth } = context;
		const { recoveryCodes } = await enrolled(context);

		const [last] = (await challenges(auth, 10)).slice(-1);
		await auth.secondFactor.recover(last as string, recoveryCodes[0] as string);

		expect(await challenges(auth, 10)).toHaveLength(10);
	});
});
