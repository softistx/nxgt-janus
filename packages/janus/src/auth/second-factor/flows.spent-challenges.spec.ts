import { describe, expect, it } from 'bun:test';
import { ada, hasher, password, person } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { fixedClock } from '../../time/clock';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import { codeAt, fromBase32, stepAt } from '../totp';
import { challenged, enrolled, key, setup } from './flows.fixtures';

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

	it('spends the challenges waiting when the password is set, or changed', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { user, secret } = await enrolled(context);

		const beforeSet = await challenged(auth);
		await auth.setPassword(user, 'a password set by an operator');
		expect(
			await rejection(auth.secondFactor.confirm(beforeSet, codeOf(secret))),
		).toMatchObject({ code: 'TOKEN_SPENT' });

		const signedIn = await auth.signIn({
			email: ada.email,
			password: 'a password set by an operator',
		});
		if (signedIn.status !== 'secondFactor')
			throw new Error('expected a challenge');
		await auth.changePassword(user, {
			current: 'a password set by an operator',
			next: 'a password changed by its user',
		});
		expect(
			await rejection(
				auth.secondFactor.confirm(signedIn.challenge, codeOf(secret)),
			),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	/**
	 * A store that writes the user's password — to `next` — after a challenge
	 * is issued, before signIn reads the user again: the order a reset can
	 * land in.
	 */
	function writingPasswordAfterChallenge(next: string) {
		const memory = createMemoryStores();
		const issued: string[] = [];
		const store: JanusStores = {
			...memory,
			tokens: {
				...memory.tokens,
				async insertToken(record) {
					await memory.tokens.insertToken(record);
					const user = await memory.users.findUser(record.userId);
					if (record.kind !== 'secondFactor' || user === null) return;
					issued.push(record.tokenHash);
					await memory.users.updateUser(
						user.id,
						{
							password: {
								hash: await hasher.hash(next),
								updatedAt: user.updatedAt,
							},
							updatedAt: user.updatedAt,
						},
						user.version,
					);
				},
			},
		};
		return { store, memory, issued };
	}

	it('refuses a sign-in whose password was written while it ran, and spends its challenge', async () => {
		const { store, memory, issued } =
			writingPasswordAfterChallenge('written meanwhile');
		const context = setup({ store });
		await enrolled(context);
		const { auth } = context;

		expect(
			await rejection(auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID' });
		expect(issued).toHaveLength(1);
		expect(
			(
				await memory.tokens.consumeToken(
					issued[0] ?? '',
					'secondFactor',
					new Date(),
				)
			)?.spentAt,
		).toBeInstanceOf(Date);
	});

	it('keeps a sign-in whose password was only rehashed while it ran', async () => {
		// Another sign-in rewrote the hash of the same password: not a change.
		const { store } = writingPasswordAfterChallenge(password);
		const context = setup({ store });
		await enrolled(context);
		const { auth } = context;

		expect((await auth.signIn({ email: ada.email, password })).status).toBe(
			'secondFactor',
		);
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
