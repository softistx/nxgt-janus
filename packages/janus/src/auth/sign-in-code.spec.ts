import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import {
	ada,
	bearer,
	hasher,
	password,
	person,
	rejection,
	setup,
} from '../../test/auth';
import { fixedClock } from '../time/clock';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import { hashSecret } from './secrets';
import { codeAt, fromBase32, stepAt } from './totp';

/** A code that is not `code`: the one a visitor mistypes. */
const other = (code: string) => (code === '000000' ? '111111' : '000000');

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

	it('refuses the code of another challenge: the hash is keyed by its own', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const first = await auth.signInCode.request(ada.email);
		const second = await auth.signInCode.request(ada.email);
		if (first === null || second === null) throw new Error('expected codes');

		const outcome =
			first.code === second.code
				? 'same code, nothing to cross'
				: await rejection(
						auth.signInCode.confirm(second.challenge, first.code),
					);
		expect(
			outcome === 'same code, nothing to cross' ||
				(outcome as { code: string }).code === 'CODE_INVALID',
		).toBe(true);
	});

	it('refuses an unknown, a lapsed or a stale challenge, and an inactive user', async () => {
		const { auth, clock } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		expect(
			await rejection(auth.signInCode.confirm('nope', '123456')),
		).toMatchObject({
			code: 'TOKEN_UNKNOWN',
		});

		const lapsed = await auth.signInCode.request(ada.email);
		clock.advance(10 * 60_000);
		expect(
			await rejection(
				auth.signInCode.confirm(lapsed?.challenge ?? '', lapsed?.code ?? ''),
			),
		).toMatchObject({ code: 'TOKEN_EXPIRED' });

		const stale = await auth.signInCode.request(ada.email);
		await auth.update(user, { email: 'lovelace@example.test' });
		expect(
			await rejection(
				auth.signInCode.confirm(stale?.challenge ?? '', stale?.code ?? ''),
			),
		).toMatchObject({ code: 'TOKEN_STALE' });

		const inactive = await auth.signInCode.request('lovelace@example.test');
		await auth.setActive(user, false);
		expect(
			await rejection(
				auth.signInCode.confirm(
					inactive?.challenge ?? '',
					inactive?.code ?? '',
				),
			),
		).toMatchObject({ code: 'USER_INACTIVE' });
	});

	it("answers another type's challenge as unknown", async () => {
		const auth = janus({
			users: {
				patient: { schema: person, password: { login: 'email' } },
				member: { schema: person, password: { login: 'email' } },
			},
			store: createMemoryStores(),
			hasher,
		});
		await auth.patient.signUp({ ...ada, password });
		const issued = await auth.patient.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		// Right or wrong, another type's API compares nothing, names nobody,
		// and leaves the challenge unspent — each call still costs an attempt.
		for (const code of [other(issued.code), issued.code]) {
			const refused = await rejection(
				auth.member.signInCode.confirm(issued.challenge, code),
			);
			expect(refused).toMatchObject({
				code: 'TOKEN_UNKNOWN',
				userId: undefined,
			});
		}
		expect(
			(await auth.patient.signInCode.confirm(issued.challenge, issued.code))
				.status,
		).toBe('signedIn');
	});

	it("spends the challenge once another type's API took its last attempt", async () => {
		const auth = janus({
			users: {
				patient: { schema: person, password: { login: 'email' } },
				member: { schema: person, password: { login: 'email' } },
			},
			store: createMemoryStores(),
			hasher,
		});
		await auth.patient.signUp({ ...ada, password });
		const issued = await auth.patient.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect(
				await rejection(
					auth.member.signInCode.confirm(issued.challenge, issued.code),
				),
			).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		}
		expect(
			await rejection(
				auth.patient.signInCode.confirm(issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('still asks for an active second factor', async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 26));
		const auth = janus({
			user: person,
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher,
			clock,
			secondFactor: {
				issuer: 'Clinic',
				keys: [{ id: 'k1', key: Buffer.alloc(32, 1).toString('base64') }],
			},
		});
		const { user } = await auth.signUp({ ...ada, password });
		const { secret } = await auth.secondFactor.enroll(user);
		await auth.secondFactor.activate(
			user,
			codeAt(fromBase32(secret), stepAt(clock.now())),
		);
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');

		const result = await auth.signInCode.confirm(issued.challenge, issued.code);

		expect(result.status).toBe('secondFactor');
		// The code proved the e-mail, whatever the second factor answers.
		expect((await auth.get(user.id)).emailVerified).toBe(true);
	});
});
