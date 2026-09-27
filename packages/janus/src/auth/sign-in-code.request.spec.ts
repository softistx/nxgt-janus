import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { ada, hasher, password, rejection, setup } from '../../test/auth';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import { hashSecret } from './secrets';

describe('signInCode.request', () => {
	it('issues a six-digit code and a challenge, and stores neither', async () => {
		const { auth, store, clock } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const issued = await auth.signInCode.request('  ADA@example.test ');

		expect(issued).toMatchObject({
			email: ada.email,
			expiresAt: new Date(clock.now().getTime() + 10 * 60_000),
			user: { id: user.id },
		});
		expect(issued?.code).toMatch(/^\d{6}$/);
		const token = await store.tokens.countAttempt(
			hashSecret(issued?.challenge ?? ''),
			'signInCode',
		);
		expect(token?.address).toBe(ada.email);
		expect(token?.codeHash).not.toBeNull();
		expect(token?.codeHash).not.toContain(issued?.code ?? '');
		expect(token?.codeHash).not.toBe(hashSecret(issued?.code ?? ''));
	});

	it('answers null for nobody, and for an inactive user — the same answer', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		await auth.setActive(user, false);

		expect(await auth.signInCode.request('nobody@example.test')).toBeNull();
		expect(await auth.signInCode.request(ada.email)).toBeNull();
	});

	it('keeps one code live: asking again spends the codes sent before', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const first = await auth.signInCode.request(ada.email);
		const second = await auth.signInCode.request(ada.email);
		if (first === null || second === null) throw new Error('expected codes');

		expect(
			await rejection(auth.signInCode.confirm(first.challenge, first.code)),
		).toMatchObject({ code: 'TOKEN_SPENT' });
		expect(
			(await auth.signInCode.confirm(second.challenge, second.code)).status,
		).toBe('signedIn');
	});

	it('leaves at most one code live when requests race', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });

		const issued = await Promise.all(
			Array.from({ length: 4 }, () => auth.signInCode.request(ada.email)),
		);
		const outcomes = await Promise.allSettled(
			issued.map((one) =>
				auth.signInCode.confirm(one?.challenge ?? '', one?.code ?? ''),
			),
		);

		expect(
			outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
		).toBeLessThanOrEqual(1);
	});

	it('answers null for a login that only looks like an e-mail', async () => {
		const auth = janus({
			users: {
				member: {
					schema: z.strictObject({ username: z.string(), email: z.email() }),
					password: { login: 'username' },
				},
			},
			store: createMemoryStores(),
			hasher,
		});
		// A username that looks like an e-mail is a login, not their address.
		await auth.member.create({
			username: 'bob@example.test',
			email: 'robert@example.test',
		});

		expect(await auth.member.signInCode.request('bob@example.test')).toBeNull();
		expect(
			await auth.member.signInCode.request('robert@example.test'),
		).not.toBeNull();
	});
});
