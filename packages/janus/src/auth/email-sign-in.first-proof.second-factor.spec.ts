import { describe, expect, it } from 'bun:test';
import { ada, bearer, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { challenged, enrolled, setup } from '../../test/second-factor';
import type { UserEvent } from './events';

type Context = ReturnType<typeof setup>;

/** The two sign-ins by e-mail, each from its request to its answer. */
const flows = {
	async signInCode({ auth }: Context) {
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');
		return auth.signInCode.confirm(issued.challenge, issued.code);
	},
	async magicLink({ auth }: Context) {
		const issued = await auth.magicLink.request(ada.email);
		if (issued === null) throw new Error('expected a link');
		return auth.magicLink.confirm(issued.token);
	},
};

/** An instance with a second factor, whose listener records what it hears. */
function listening() {
	const received: UserEvent[] = [];
	const context = setup({ events: (event) => void received.push(event) });
	const types = () => received.map((event) => event.type);
	return { context, received, types };
}

for (const [name, signInByEmail] of Object.entries(flows)) {
	describe(`${name}.confirm, on an e-mail never proved, and a second factor`, () => {
		it('removes the factor and its recovery codes: the owner is asked for none', async () => {
			const { context } = listening();
			const { auth } = context;
			// Somebody signs up with Ada's e-mail, and a factor on their phone.
			const { user } = await enrolled(context);
			const waiting = await challenged(auth);

			const signedIn = await signInByEmail(context);

			if (signedIn.status !== 'signedIn') throw new Error('expected a session');
			expect(signedIn.user.hasSecondFactor).toBe(false);
			expect(await auth.secondFactor.recoveryCodesLeft(user)).toBeNull();
			expect((await auth.authenticate(bearer(signedIn.token)))?.user.id).toBe(
				user.id,
			);
			// The sign-in the squatter left waiting on the factor cannot finish.
			expect(
				await rejection(auth.secondFactor.confirm(waiting, '000000')),
			).toMatchObject({ code: 'TOKEN_SPENT' });
			// And the owner's next sign-in by e-mail asks for no factor either.
			expect((await signInByEmail(context)).status).toBe('signedIn');
		});

		it('sends user.secondFactorDisabled after the other two', async () => {
			const { context, received, types } = listening();
			await enrolled(context);
			received.length = 0;

			await signInByEmail(context);

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

			await signInByEmail(context);

			expect((await store.users.findUser(user.id))?.secondFactor).toBeNull();
			expect(types()).toEqual(['user.emailVerified', 'user.passwordChanged']);
		});
	});

	describe(`${name}.confirm, on an e-mail already proved, and a second factor`, () => {
		it('keeps the factor, asks for it, and reports nothing', async () => {
			const { context, received } = listening();
			const { auth } = context;
			const { user } = await enrolled(context);
			await auth.verifyEmail.confirm((await auth.verifyEmail.send(user)).token);
			received.length = 0;

			const result = await signInByEmail(context);

			expect(result.status).toBe('secondFactor');
			expect(await auth.secondFactor.recoveryCodesLeft(user)).toBe(10);
			expect(received).toEqual([]);
		});
	});
}
