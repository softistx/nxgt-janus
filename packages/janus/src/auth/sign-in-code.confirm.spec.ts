import { describe, expect, it } from 'bun:test';
import { ada, bearer, password, rejection, setup } from '../../test/auth';
import { other } from './sign-in-code.fixtures';

describe('signInCode.confirm', () => {
	it('signs in with the code, verifies the e-mail, and spends the challenge', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		const signedIn = await auth.signInCode.confirm(
			issued.challenge,
			issued.code,
		);

		expect(signedIn.status).toBe('signedIn');
		expect(signedIn.user.emailVerified).toBe(true);
		expect((await auth.authenticate(bearer(signedIn.token)))?.user.id).toBe(
			signedIn.user.id,
		);
		expect(
			await rejection(auth.signInCode.confirm(issued.challenge, issued.code)),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('signs in a user who has no password', async () => {
		const { auth } = setup();
		await auth.create(ada);
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		expect(
			(await auth.signInCode.confirm(issued.challenge, issued.code)).user
				.hasPassword,
		).toBe(false);
	});

	it('takes five attempts, then spends the challenge', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		for (const attemptsLeft of [4, 3, 2, 1, 0]) {
			expect(
				await rejection(
					auth.signInCode.confirm(issued.challenge, other(issued.code)),
				),
			).toMatchObject({ code: 'CODE_INVALID', attemptsLeft, userId: user.id });
		}
		expect(
			await rejection(auth.signInCode.confirm(issued.challenge, issued.code)),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('refuses every code past the fifth when they arrive at once, the right one included', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		const outcomes = await Promise.all(
			[...Array(5).fill(other(issued.code)), ...Array(3).fill(issued.code)].map(
				(code) => rejection(auth.signInCode.confirm(issued.challenge, code)),
			),
		);

		expect(
			outcomes.map((outcome) => (outcome as { code: string }).code),
		).toEqual(Array(8).fill('CODE_INVALID'));
	});

	it('counts a malformed code as an attempt', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		for (const [code, attemptsLeft] of [
			['12345', 4],
			['abcdef', 3],
			[` ${issued.code}`, 2],
		] as const) {
			expect(
				await rejection(auth.signInCode.confirm(issued.challenge, code)),
			).toMatchObject({ code: 'CODE_INVALID', attemptsLeft });
		}
	});

	it('opens one session for two right codes sent at once', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		const outcomes = await Promise.allSettled([
			auth.signInCode.confirm(issued.challenge, issued.code),
			auth.signInCode.confirm(issued.challenge, issued.code),
		]);

		expect(
			outcomes.filter((outcome) => outcome.status === 'fulfilled'),
		).toHaveLength(1);
		expect(
			outcomes.find((outcome) => outcome.status === 'rejected')?.reason,
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('writes nothing for an e-mail already verified', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const first = await auth.signInCode.request(ada.email);
		const verified = await auth.signInCode.confirm(
			first?.challenge ?? '',
			first?.code ?? '',
		);
		const again = await auth.signInCode.request(ada.email);

		const signedIn = await auth.signInCode.confirm(
			again?.challenge ?? '',
			again?.code ?? '',
		);

		expect(signedIn.user.version).toBe(verified.user.version);
		expect(signedIn.user.emailVerified).toBe(true);
	});
});
