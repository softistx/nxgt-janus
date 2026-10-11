import { describe, expect, it } from 'bun:test';
import { ada, bearer, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { challenged, enrolled, setup } from '../../../test/second-factor';
import type { UserEvent } from '../events';

/** An instance with a second factor, whose listener records what it hears. */
function listening() {
	const received: UserEvent[] = [];
	const context = setup({ events: (event) => void received.push(event) });
	const types = () => received.map((event) => event.type);
	return { context, received, types };
}

describe('verifyEmail.proveFirst, on an e-mail never proved, and a second factor', () => {
	it('removes an active factor and its recovery codes, and ends its challenges', async () => {
		const { context } = listening();
		const { auth } = context;
		// Somebody signs up with Ada's e-mail, and a factor on their phone.
		const { user } = await enrolled(context);
		const waiting = await challenged(auth);

		const first = await auth.verifyEmail.proveFirst(user);

		expect(first.user.hasSecondFactor).toBe(false);
		expect(await auth.secondFactor.recoveryCodesLeft(user)).toBeNull();
		expect(
			await rejection(auth.secondFactor.confirm(waiting, '000000')),
		).toMatchObject({ code: 'TOKEN_SPENT' });
		// The owner, signed in on the application's proof, is asked for no factor.
		const signedIn = await auth.signInProven(user);
		if (signedIn.status !== 'signedIn') throw new Error('expected a session');
		expect((await auth.authenticate(bearer(signedIn.token)))?.user.id).toBe(
			user.id,
		);
	});

	it('sends user.secondFactorDisabled after the other two', async () => {
		const { context, received, types } = listening();
		const { user } = await enrolled(context);
		received.length = 0;

		await context.auth.verifyEmail.proveFirst(user);

		expect(types()).toEqual([
			'user.emailVerified',
			'user.passwordChanged',
			'user.secondFactorDisabled',
		]);
	});

	it('removes a factor still waiting for its first code, and reports none', async () => {
		const { context, received, types } = listening();
		const { auth, store } = context;
		const { user } = await auth.signUp({ ...ada, password });
		await auth.secondFactor.enroll(user);
		received.length = 0;

		await auth.verifyEmail.proveFirst(user);

		expect((await store.users.findUser(user.id))?.secondFactor).toBeNull();
		expect(types()).toEqual(['user.emailVerified', 'user.passwordChanged']);
	});
});

describe('verifyEmail.proveFirst, on an e-mail already proved, and a second factor', () => {
	it('keeps the factor and reports nothing', async () => {
		const { context, received } = listening();
		const { auth } = context;
		const { user } = await enrolled(context);
		await auth.verifyEmail.confirm((await auth.verifyEmail.send(user)).token);
		received.length = 0;

		const first = await auth.verifyEmail.proveFirst(user);

		expect(first.proved).toBe(false);
		expect(first.user.hasSecondFactor).toBe(true);
		expect((await auth.signInProven(user)).status).toBe('secondFactor');
		expect(received).toEqual([]);
	});
});
