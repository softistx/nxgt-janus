import { describe, expect, it } from 'bun:test';
import {
	ada,
	bearer,
	hasher,
	password,
	person,
	rejection,
} from '../../../test/auth';
import { fixedClock } from '../../time/clock';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import { codeAt, fromBase32, stepAt } from '../totp';

const key = (fill: number) => Buffer.alloc(32, fill).toString('base64');

function setup(
	options: {
		store?: JanusStores;
		keys?: readonly [
			{ id: string; key: string },
			...{ id: string; key: string }[],
		];
	} = {},
) {
	const clock = fixedClock(Date.UTC(2026, 8, 26));
	const store = options.store ?? createMemoryStores();
	const auth = janus({
		user: person,
		password: { login: 'email' },
		store,
		hasher,
		clock,
		secondFactor: {
			issuer: 'Clinic',
			keys: options.keys ?? [{ id: 'k1', key: key(1) }],
		},
	});
	/** The code an authenticator app shows now, `drift` steps away. */
	const codeOf = (secret: string, drift = 0) =>
		codeAt(fromBase32(secret), stepAt(clock.now()) + drift);
	return { auth, store, clock, codeOf };
}

/** A user whose second factor is active, and the secret their app holds. */
async function enrolled(context: ReturnType<typeof setup>) {
	const { auth, clock, codeOf } = context;
	const { user } = await auth.signUp({ ...ada, password });
	const { secret } = await auth.secondFactor.enroll(user);
	await auth.secondFactor.activate(user, codeOf(secret));
	// The activation used this step's code: the next one is a new step.
	clock.advance(30_000);
	return { user, secret };
}

/** Signs in, and answers the challenge `signIn` must have asked for. */
async function challenged(auth: ReturnType<typeof setup>['auth']) {
	const result = await auth.signIn({ email: ada.email, password });
	if (result.status !== 'secondFactor') throw new Error('expected a challenge');
	return result.challenge;
}

describe('secondFactor.enroll and activate', () => {
	it('answers the secret and its URI, and stores the secret sealed', async () => {
		const { auth, store } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const { secret, uri } = await auth.secondFactor.enroll(user);

		expect(secret).toMatch(/^[A-Z2-7]{32}$/);
		expect(uri).toStartWith('otpauth://totp/Clinic:ada%40example.test?');
		expect(new URL(uri).searchParams.get('secret')).toBe(secret);
		const record = await store.users.findUser(user.id);
		expect(record?.secondFactor).toMatchObject({
			method: 'totp',
			confirmedAt: null,
			lastStep: null,
		});
		expect(record?.secondFactor?.secret).toStartWith('v1.k1.');
		expect(record?.secondFactor?.secret).not.toContain(secret);
	});

	it('asks for nothing until a first code activated the factor', async () => {
		const { auth, codeOf } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const { secret } = await auth.secondFactor.enroll(user);

		const before = await auth.signIn({ email: ada.email, password });
		expect(before.status).toBe('signedIn');
		expect((await auth.get(user.id)).hasSecondFactor).toBe(false);

		const active = await auth.secondFactor.activate(user, codeOf(secret));
		expect(active.hasSecondFactor).toBe(true);
		expect((await auth.signIn({ email: ada.email, password })).status).toBe(
			'secondFactor',
		);
	});

	it('refuses a wrong first code, and keeps the factor waiting', async () => {
		const { auth, codeOf } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const { secret } = await auth.secondFactor.enroll(user);
		const wrong = codeOf(secret) === '000000' ? '111111' : '000000';

		const refused = await rejection(auth.secondFactor.activate(user, wrong));

		expect(refused).toMatchObject({
			code: 'CODE_INVALID',
			attemptsLeft: undefined,
		});
		expect((await auth.get(user.id)).hasSecondFactor).toBe(false);
	});

	it('says which state a factor is in when it cannot change', async () => {
		const context = setup();
		const { auth } = context;
		const { user } = await auth.signUp({ ...ada, password });

		expect(
			await rejection(auth.secondFactor.activate(user, '123456')),
		).toMatchObject({
			code: 'SECOND_FACTOR_NOT_ENROLLED',
		});

		const { secret } = await auth.secondFactor.enroll(user);
		await auth.secondFactor.activate(user, context.codeOf(secret));
		expect(await rejection(auth.secondFactor.enroll(user))).toMatchObject({
			code: 'SECOND_FACTOR_ACTIVE',
		});
		expect(
			await rejection(
				auth.secondFactor.activate(user, context.codeOf(secret, 1)),
			),
		).toMatchObject({ code: 'SECOND_FACTOR_ACTIVE' });
	});

	it('replaces a factor still waiting: the last QR code shown is the one that works', async () => {
		const { auth, codeOf } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const first = await auth.secondFactor.enroll(user);
		const second = await auth.secondFactor.enroll(user);

		expect(second.secret).not.toBe(first.secret);
		expect(
			await rejection(auth.secondFactor.activate(user, codeOf(first.secret))),
		).toMatchObject({ code: 'CODE_INVALID' });
		await auth.secondFactor.activate(user, codeOf(second.secret));
	});
});

describe('signIn with a second factor', () => {
	it('answers a challenge instead of a session', async () => {
		const context = setup();
		const { user } = await enrolled(context);
		const now = context.clock.now().getTime();

		const result = await context.auth.signIn({ email: ada.email, password });

		expect(result).toEqual({
			status: 'secondFactor',
			challenge: expect.any(String),
			expiresAt: new Date(now + 5 * 60_000),
			userId: user.id,
		});
		expect(Object.keys(result)).not.toContain('token');
	});

	it('opens the session once the code matches, and spends the challenge', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret } = await enrolled(context);
		const challenge = await challenged(auth);

		const signedIn = await auth.secondFactor.confirm(challenge, codeOf(secret));

		expect(signedIn.status).toBe('signedIn');
		expect(signedIn.user.hasSecondFactor).toBe(true);
		expect((await auth.authenticate(bearer(signedIn.token)))?.user.id).toBe(
			signedIn.user.id,
		);
		context.clock.advance(30_000);
		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('accepts a code once: a replay on a new challenge is refused', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret } = await enrolled(context);
		const code = codeOf(secret);
		await auth.secondFactor.confirm(await challenged(auth), code);

		const replayed = await rejection(
			auth.secondFactor.confirm(await challenged(auth), code),
		);

		expect(replayed).toMatchObject({ code: 'CODE_INVALID', attemptsLeft: 4 });
	});

	it('takes five attempts, then spends the challenge', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		const challenge = await challenged(auth);
		const right = codeOf(secret);
		const wrong = right === '000000' ? '111111' : '000000';

		for (const attemptsLeft of [4, 3, 2, 1, 0]) {
			expect(
				await rejection(auth.secondFactor.confirm(challenge, wrong)),
			).toMatchObject({ code: 'CODE_INVALID', attemptsLeft, userId: user.id });
		}
		expect(
			await rejection(auth.secondFactor.confirm(challenge, right)),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('counts every call, a malformed code included', async () => {
		const context = setup();
		const { auth } = context;
		await enrolled(context);
		const challenge = await challenged(auth);

		expect(
			await rejection(auth.secondFactor.confirm(challenge, 'abc')),
		).toMatchObject({ code: 'CODE_INVALID', attemptsLeft: 4 });
	});

	it('refuses an unknown or a lapsed challenge', async () => {
		const context = setup();
		const { auth, clock, codeOf } = context;
		const { secret } = await enrolled(context);

		expect(
			await rejection(auth.secondFactor.confirm('nope', codeOf(secret))),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });

		const challenge = await challenged(auth);
		clock.advance(5 * 60_000);
		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'TOKEN_EXPIRED' });
	});

	it('refuses a user deactivated since, and spends the challenge', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		const challenge = await challenged(auth);
		await auth.setActive(user, false);

		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'USER_INACTIVE' });
		await auth.setActive(user, true);
		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('refuses a factor disabled since the challenge', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		const challenge = await challenged(auth);
		await auth.secondFactor.disable(user);

		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'SECOND_FACTOR_NOT_ENROLLED' });
	});

	it('lets one of two concurrent confirmations with the same code through', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret } = await enrolled(context);
		const code = codeOf(secret);
		const challenges = [await challenged(auth), await challenged(auth)];

		const outcomes = await Promise.allSettled(
			challenges.map((challenge) => auth.secondFactor.confirm(challenge, code)),
		);

		expect(
			outcomes.filter((outcome) => outcome.status === 'fulfilled'),
		).toHaveLength(1);
	});
});

describe('the challenge, raced and crossed', () => {
	it('refuses every code past the fifth, the right one included, when they arrive at once', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret } = await enrolled(context);
		const challenge = await challenged(auth);
		const right = codeOf(secret);
		const wrong = right === '000000' ? '111111' : '000000';

		const outcomes = await Promise.all(
			[...Array(5).fill(wrong), ...Array(3).fill(right)].map((code) =>
				rejection(auth.secondFactor.confirm(challenge, code)),
			),
		);

		expect(
			outcomes.map((outcome) => (outcome as { code: string }).code),
		).toEqual(Array(8).fill('CODE_INVALID'));
		expect(
			outcomes.map(
				(outcome) => (outcome as { attemptsLeft: number }).attemptsLeft,
			),
		).toEqual([4, 3, 2, 1, 0, 0, 0, 0]);
	});

	it("answers another type's challenge as unknown", async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 26));
		const auth = janus({
			users: {
				patient: { schema: person, password: { login: 'email' } },
				staff: { schema: person, password: { login: 'email' } },
			},
			store: createMemoryStores(),
			hasher,
			clock,
			secondFactor: { issuer: 'Clinic', keys: [{ id: 'k1', key: key(1) }] },
		});
		const { user } = await auth.patient.signUp({ ...ada, password });
		const { secret } = await auth.patient.secondFactor.enroll(user);
		const codeNow = () => codeAt(fromBase32(secret), stepAt(clock.now()));
		await auth.patient.secondFactor.activate(user, codeNow());
		clock.advance(30_000);
		const result = await auth.patient.signIn({ email: ada.email, password });
		if (result.status !== 'secondFactor')
			throw new Error('expected a challenge');

		expect(
			await rejection(
				auth.staff.secondFactor.confirm(result.challenge, codeNow()),
			),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect(
			(await auth.patient.secondFactor.confirm(result.challenge, codeNow()))
				.status,
		).toBe('signedIn');
	});
});

describe('what spends a challenge before its code', () => {
	it("spends it once another type's API took its last attempt", async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 26));
		const auth = janus({
			users: {
				patient: { schema: person, password: { login: 'email' } },
				staff: { schema: person, password: { login: 'email' } },
			},
			store: createMemoryStores(),
			hasher,
			clock,
			secondFactor: { issuer: 'Clinic', keys: [{ id: 'k1', key: key(1) }] },
		});
		const { user } = await auth.patient.signUp({ ...ada, password });
		const { secret } = await auth.patient.secondFactor.enroll(user);
		const codeNow = () => codeAt(fromBase32(secret), stepAt(clock.now()));
		await auth.patient.secondFactor.activate(user, codeNow());
		clock.advance(30_000);
		const result = await auth.patient.signIn({ email: ada.email, password });
		if (result.status !== 'secondFactor')
			throw new Error('expected a challenge');

		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect(
				await rejection(
					auth.staff.secondFactor.confirm(result.challenge, codeNow()),
				),
			).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		}
		expect(
			await rejection(
				auth.patient.secondFactor.confirm(result.challenge, codeNow()),
			),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('spends the challenges a password reset finds waiting', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret } = await enrolled(context);
		const challenge = await challenged(auth);
		const reset = await auth.resetPassword.request(ada.email);
		if (reset === null) throw new Error('expected a reset link');

		await auth.resetPassword.confirm(reset.token, 'a new password, long');

		expect(
			await rejection(auth.secondFactor.confirm(challenge, codeOf(secret))),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});
});

describe('secondFactor.disable', () => {
	it('removes the factor: signIn answers a session again', async () => {
		const context = setup();
		const { auth, store } = context;
		const { user } = await enrolled(context);

		const disabled = await auth.secondFactor.disable(user);

		expect(disabled.hasSecondFactor).toBe(false);
		expect((await store.users.findUser(user.id))?.secondFactor).toBeNull();
		expect((await auth.signIn({ email: ada.email, password })).status).toBe(
			'signedIn',
		);
	});
});

describe('the keys', () => {
	it('opens a secret sealed with an older key, and seals it again with the first', async () => {
		const store = createMemoryStores();
		const before = setup({ store, keys: [{ id: 'old', key: key(1) }] });
		const { secret, user } = await enrolled(before);

		const after = setup({
			store,
			keys: [
				{ id: 'new', key: key(2) },
				{ id: 'old', key: key(1) },
			],
		});
		after.clock.set(before.clock.now());
		await after.auth.secondFactor.confirm(
			await challenged(after.auth),
			after.codeOf(secret),
		);

		expect(
			(await store.users.findUser(user.id))?.secondFactor?.secret,
		).toStartWith('v1.new.');
	});

	it('refuses to sign in a user with a factor when janus() has no keys', async () => {
		const store = createMemoryStores();
		const context = setup({ store });
		await enrolled(context);
		const bare = janus({
			user: person,
			password: { login: 'email' },
			store,
			hasher,
		});

		expect(
			await rejection(bare.signIn({ email: ada.email, password })),
		).toBeInstanceOf(TypeError);
	});

	it('refuses a configuration that cannot seal', () => {
		const base = {
			user: person,
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher,
		} as const;
		expect(() =>
			janus({
				...base,
				secondFactor: { issuer: ' ', keys: [{ id: 'k', key: key(1) }] },
			}),
		).toThrow('janus: secondFactor.issuer must name your application');
		expect(() =>
			janus({
				...base,
				secondFactor: { issuer: 'Clinic', keys: [{ id: 'k', key: 'short' }] },
			}),
		).toThrow('janus: secondFactor.keys: the key "k" is not 32 bytes');
		expect(() =>
			janus({
				...base,
				secondFactor: {
					issuer: 'Clinic',
					keys: [{ id: 'k', key: key(1) }],
					challenge: 'soon' as '5m',
				},
			}),
		).toThrow('secondFactor.challenge');
	});
});
