import { describe, expect, it } from 'bun:test';
import { ada, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { other, signedIn } from './flows.fixtures';

describe('stepUp by e-mail', () => {
	it('issues a code for the user’s e-mail, and stamps the session that confirms it', async () => {
		const context = setup();
		const { auth, clock } = context;
		const { user, session, request } = await signedIn(context);
		clock.advance(3_600_000);

		const issued = await auth.stepUp.request(user);
		expect(issued).toMatchObject({ via: 'email', email: ada.email });
		expect(issued.code).toMatch(/^\d{6}$/);

		const confirmed = await auth.stepUp.confirm(
			request,
			issued.challenge,
			issued.code,
		);
		expect(confirmed.id).toBe(session.id);
		expect(confirmed.authenticatedAt).toEqual(clock.now());
		expect(confirmed.expiresAt).toEqual(session.expiresAt);
		expect((await auth.authenticate(request))?.session.authenticatedAt).toEqual(
			clock.now(),
		);
		expect(
			await rejection(
				auth.stepUp.confirm(request, issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('takes five attempts, then spends the challenge', async () => {
		const context = setup();
		const { user, request } = await signedIn(context);
		const issued = await context.auth.stepUp.request(user);

		for (const attemptsLeft of [4, 3, 2, 1, 0]) {
			expect(
				await rejection(
					context.auth.stepUp.confirm(
						request,
						issued.challenge,
						other(issued.code),
					),
				),
			).toMatchObject({ code: 'CODE_INVALID', attemptsLeft, userId: user.id });
		}
		expect(
			await rejection(
				context.auth.stepUp.confirm(request, issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('keeps one step-up live per user: the one issued before stops working', async () => {
		const context = setup();
		const { user, request } = await signedIn(context);
		const first = await context.auth.stepUp.request(user);
		const second = await context.auth.stepUp.request(user);

		expect(
			await rejection(
				context.auth.stepUp.confirm(request, first.challenge, first.code),
			),
		).toMatchObject({ code: 'TOKEN_SPENT' });
		await context.auth.stepUp.confirm(request, second.challenge, second.code);
	});

	it('is a kind of its own: a sign-in code confirms no action, and a step-up’s code signs nobody in', async () => {
		const context = setup();
		const { user, request } = await signedIn(context);
		const signInCode = await context.auth.signInCode.request(ada.email);
		if (signInCode === null) throw new Error('expected a code');
		const stepUp = await context.auth.stepUp.request(user);

		expect(
			await rejection(
				context.auth.stepUp.confirm(
					request,
					signInCode.challenge,
					signInCode.code,
				),
			),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect(
			await rejection(
				context.auth.signInCode.confirm(stepUp.challenge, stepUp.code),
			),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		// Neither spent the other: each still works as itself.
		await context.auth.stepUp.confirm(request, stepUp.challenge, stepUp.code);
		await context.auth.signInCode.confirm(
			signInCode.challenge,
			signInCode.code,
		);
	});

	it('refuses a code sent to an e-mail the user changed since', async () => {
		const context = setup();
		const { user, request } = await signedIn(context);
		const issued = await context.auth.stepUp.request(user);
		await context.auth.update(user, { email: 'lovelace@example.test' });

		expect(
			await rejection(
				context.auth.stepUp.confirm(request, issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_STALE' });
	});

	it('refuses an inactive user, on request and on confirmation', async () => {
		const context = setup();
		const { user, request } = await signedIn(context);
		const issued = await context.auth.stepUp.request(user);
		await context.auth.setActive(user, false);

		expect(
			await rejection(
				context.auth.stepUp.confirm(request, issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'USER_INACTIVE' });
		expect(await rejection(context.auth.stepUp.request(user))).toMatchObject({
			code: 'USER_INACTIVE',
		});
	});

	it('refuses a user of no such id with NOT_FOUND', async () => {
		const { auth } = setup();
		expect(
			await rejection(
				auth.stepUp.request('0192b3a4-0000-7000-8000-000000000000'),
			),
		).toMatchObject({ code: 'NOT_FOUND' });
	});

	it('opens no session, and writes nothing on the user', async () => {
		const context = setup();
		const { user, request } = await signedIn(context);
		const issued = await context.auth.stepUp.request(user);
		await context.auth.stepUp.confirm(request, issued.challenge, issued.code);

		// The sign-up's session and the sign-in's: none more.
		expect(await context.auth.signOutEverywhere(user)).toBe(2);
		expect((await context.auth.getUser(user.id)).version).toBe(user.version);
	});

	it('reads the session from the cookie, as authenticate does', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const signed = await auth.signIn({ email: ada.email, password });
		const issued = await auth.stepUp.request(signed.user);

		const request = {
			headers: { cookie: `${auth.cookie.name}=${signed.token}` },
		};
		expect(
			(await auth.stepUp.confirm(request, issued.challenge, issued.code)).id,
		).toBe(signed.session.id);
	});

	it('refuses a user whose e-mail is gone from the record with NOT_FOUND', async () => {
		const context = setup();
		const { user } = await signedIn(context);
		const record = await context.store.users.findUser(user.id);
		if (record === null) throw new Error('expected the user');
		await context.store.users.updateUser(
			user.id,
			{ fields: { name: ada.name }, updatedAt: context.clock.now() },
			record.version,
		);

		expect(await rejection(context.auth.stepUp.request(user.id))).toMatchObject(
			{
				code: 'NOT_FOUND',
				message: 'stepUp.request: the user has no e-mail',
			},
		);
	});
});
