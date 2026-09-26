import { describe, expect, it } from 'bun:test';
import {
	ada,
	bearer,
	clinic,
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

	it('answers null for a login that only looks like an e-mail', async () => {
		const { auth } = clinic();
		await auth.staff.create({ username: 'ada@example.test', service: 'x' });
		// Staff have no e-mail: the flow does not exist on their type at all.
		expect('signInCode' in auth.patient).toBe(true);
		expect(
			await auth.patient.signInCode.request('ada@example.test'),
		).toBeNull();
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

		expect(
			await rejection(
				auth.member.signInCode.confirm(issued.challenge, issued.code),
			),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect(
			(await auth.patient.signInCode.confirm(issued.challenge, issued.code))
				.status,
		).toBe('signedIn');
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
	});
});
