import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { ada, hasher, password, setup } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { fixedClock } from '../time/clock';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import { hashSecret } from './secrets';

describe('magicLink.request', () => {
	it('issues a 32-byte token for fifteen minutes, and stores only its hash', async () => {
		const { auth, store, clock } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const issued = await auth.magicLink.request('  ADA@example.test ');

		expect(issued).toMatchObject({
			email: ada.email,
			expiresAt: new Date(clock.now().getTime() + 15 * 60_000),
			user: { id: user.id },
		});
		// 32 bytes, base64url: safe in a URL without escaping.
		expect(issued?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const token = await store.tokens.consumeToken(
			hashSecret(issued?.token ?? ''),
			'magicLink',
			clock.now(),
		);
		expect(token).toMatchObject({
			address: ada.email,
			codeHash: null,
			userId: user.id,
		});
		expect(JSON.stringify(token)).not.toContain(issued?.token ?? '');
	});

	it('lasts as long as tokens.magicLink says', async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 28));
		const auth = janus({
			user: z.strictObject({ email: z.email() }),
			store: createMemoryStores(),
			clock,
			tokens: { magicLink: '5m' },
		});
		await auth.create({ email: ada.email });

		const issued = await auth.magicLink.request(ada.email);

		expect(issued?.expiresAt).toEqual(
			new Date(clock.now().getTime() + 5 * 60_000),
		);
	});

	it('answers null for nobody, and for an inactive user — the same answer', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		await auth.setActive(user, false);

		expect(await auth.magicLink.request('nobody@example.test')).toBeNull();
		expect(await auth.magicLink.request(ada.email)).toBeNull();
	});

	it('keeps one link live: asking again spends the links sent before', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const first = await auth.magicLink.request(ada.email);
		const second = await auth.magicLink.request(ada.email);

		expect(
			await rejection(auth.magicLink.confirm(first?.token ?? '')),
		).toMatchObject({ code: 'TOKEN_SPENT' });
		expect((await auth.magicLink.confirm(second?.token ?? '')).status).toBe(
			'signedIn',
		);
	});

	it('leaves at most one link live when requests race', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });

		const issued = await Promise.all(
			Array.from({ length: 4 }, () => auth.magicLink.request(ada.email)),
		);
		const outcomes = await Promise.allSettled(
			issued.map((one) => auth.magicLink.confirm(one?.token ?? '')),
		);

		expect(
			outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
		).toBeLessThanOrEqual(1);
	});

	it('leaves a sign-in code live, and a code leaves the link live', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const code = await auth.signInCode.request(ada.email);
		const link = await auth.magicLink.request(ada.email);
		await auth.signInCode.request(ada.email); // spends the first code only

		expect((await auth.magicLink.confirm(link?.token ?? '')).status).toBe(
			'signedIn',
		);
		expect(
			await rejection(
				auth.signInCode.confirm(code?.challenge ?? '', code?.code ?? ''),
			),
		).toMatchObject({ code: 'TOKEN_SPENT' });
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
		await auth.member.create({
			username: 'bob@example.test',
			email: 'robert@example.test',
		});

		expect(await auth.member.magicLink.request('bob@example.test')).toBeNull();
		expect(
			await auth.member.magicLink.request('robert@example.test'),
		).not.toBeNull();
	});
});
