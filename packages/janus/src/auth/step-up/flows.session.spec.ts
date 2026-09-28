import { describe, expect, it } from 'bun:test';
import { bearer, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { createMemoryStores } from '../port/memory';
import { signedIn } from './flows.fixtures';

describe('stepUp.confirm and the session it confirms', () => {
	it('refuses a request that presents no session, and counts the attempt', async () => {
		const context = setup();
		const { user, request } = await signedIn(context);
		const issued = await context.auth.stepUp.request(user);

		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect(
				await rejection(
					context.auth.stepUp.confirm(
						new Headers(),
						issued.challenge,
						issued.code,
					),
				),
			).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		}
		// The fifth spent it: the right session comes too late.
		expect(
			await rejection(
				context.auth.stepUp.confirm(request, issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('refuses another user’s session: a challenge is confirmed on its user’s own', async () => {
		const context = setup();
		const { auth } = context;
		const { user } = await signedIn(context);
		await auth.signUp({ email: 'grace@example.test', name: 'Grace', password });
		const grace = await auth.signIn({ email: 'grace@example.test', password });
		const issued = await auth.stepUp.request(user);

		expect(
			await rejection(
				auth.stepUp.confirm(bearer(grace.token), issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect(
			(await auth.authenticate(bearer(grace.token)))?.session.authenticatedAt,
		).toEqual(grace.session.authenticatedAt);
	});

	it('refuses a revoked session', async () => {
		const context = setup();
		const { user, request } = await signedIn(context);
		const issued = await context.auth.stepUp.request(user);
		await context.auth.signOut(request);

		expect(
			await rejection(
				context.auth.stepUp.confirm(request, issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
	});

	it('refuses a session that lapsed while the challenge still stands', async () => {
		const context = setup();
		const { clock } = context;
		const { user, request } = await signedIn(context);
		// Seven days, the lifespan, less a minute: the challenge outlives it.
		clock.advance(7 * 86_400_000 - 60_000);
		const issued = await context.auth.stepUp.request(user);
		clock.advance(120_000);

		expect(
			await rejection(
				context.auth.stepUp.confirm(request, issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
	});

	it('never brings back a session revoked while the code was checked', async () => {
		const store = createMemoryStores();
		const reauthenticate = store.sessions.reauthenticateSession;
		const context = setup({
			store: {
				...store,
				sessions: {
					...store.sessions,
					async reauthenticateSession(id, at) {
						await store.sessions.revokeSession(id, at);
						return reauthenticate(id, at);
					},
				},
			},
		});
		const { user, request } = await signedIn(context);
		const issued = await context.auth.stepUp.request(user);

		expect(
			await rejection(
				context.auth.stepUp.confirm(request, issued.challenge, issued.code),
			),
		).toMatchObject({
			code: 'TOKEN_UNKNOWN',
			message:
				'stepUp.confirm: the session was signed out while the code was checked',
		});
		expect(await context.auth.authenticate(request)).toBeNull();
	});

	it('refuses a challenge whose user is gone, while the session stands, as unknown', async () => {
		const context = setup();
		const { user, request } = await signedIn(context);
		const issued = await context.auth.stepUp.request(user);
		// Removed from the store alone: the session is still there.
		await context.store.users.deleteUser(user.id);

		expect(
			await rejection(
				context.auth.stepUp.confirm(request, issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
	});
});
