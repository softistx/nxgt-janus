import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { ada, hasher, password, person } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { fixedClock } from '../../time/clock';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import { codeAt, fromBase32, stepAt } from '../totp';

function strict(requireVerifiedEmail: boolean | undefined = true) {
	const memory = createMemoryStores();
	/** How many sessions were ever opened. */
	const opened: string[] = [];
	const store: JanusStores = {
		...memory,
		sessions: {
			...memory.sessions,
			async insertSession(record) {
				opened.push(record.id);
				return memory.sessions.insertSession(record);
			},
		},
	};
	const auth = janus({
		user: person,
		password: { login: 'email', requireVerifiedEmail },
		store,
		hasher,
		clock: fixedClock(Date.UTC(2026, 8, 23)),
	});
	return { auth, opened };
}

describe('password.requireVerifiedEmail', () => {
	it('refuses a correct password on an unverified address, and opens no session', async () => {
		const { auth, opened } = strict();
		const { user } = await auth.signUp({ ...ada, password });
		// The sign-up's own session is the only one.
		expect(opened).toHaveLength(1);

		const error = await rejection(auth.signIn({ email: ada.email, password }));

		expect(error).toMatchObject({
			name: 'EmailUnverifiedError',
			code: 'EMAIL_UNVERIFIED',
			userId: user.id,
		});
		expect(opened).toHaveLength(1);
	});

	it('answers a wrong password exactly as without the option', async () => {
		const { auth } = strict();
		await auth.signUp({ ...ada, password });

		const wrong = await rejection(
			auth.signIn({ email: ada.email, password: 'not the password' }),
		);
		const unknown = await rejection(
			auth.signIn({ email: 'nobody@example.test', password }),
		);

		expect(wrong).toMatchObject({
			code: 'CREDENTIALS_INVALID',
			reason: 'wrongPassword',
		});
		expect(unknown).toMatchObject({ code: 'CREDENTIALS_INVALID' });
	});

	it('signs in once the address is verified', async () => {
		const { auth } = strict();
		const { user } = await auth.signUp({ ...ada, password });
		const { token } = await auth.verifyEmail.send(user);
		await auth.verifyEmail.confirm(token);

		const signed = await auth.signIn({ email: ada.email, password });

		expect(signed).toMatchObject({
			user: { id: user.id, emailVerified: true },
		});
	});

	it('is off by default, and when false', async () => {
		for (const option of [undefined, false]) {
			const { auth } = strict(option === undefined ? false : option);
			await auth.signUp({ ...ada, password });
			expect(await auth.signIn({ email: ada.email, password })).toMatchObject({
				user: { emailVerified: false },
			});
		}
	});

	it('refuses a value that is not a boolean when janus() is built', () => {
		expect(() =>
			janus({
				user: person,
				password: {
					login: 'email',
					requireVerifiedEmail: 'yes' as unknown as boolean,
				},
				store: createMemoryStores(),
				hasher,
			}),
		).toThrow('password.requireVerifiedEmail must be a boolean');
	});
});

describe('password.requireVerifiedEmail, with the other refusals', () => {
	it('answers a throttled login CREDENTIALS_INVALID with reason throttled, the right password included', async () => {
		const memory = createMemoryStores();
		const auth = janus({
			user: person,
			password: { login: 'email', requireVerifiedEmail: true },
			store: memory,
			hasher,
			clock: fixedClock(Date.UTC(2026, 8, 23)),
			signIn: { throttle: { attempts: 1 } },
		});
		await auth.signUp({ ...ada, password });

		// The first try is the right password on an unverified address.
		expect(
			await rejection(auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'EMAIL_UNVERIFIED' });
		// The second is past the limit: told nothing about the address.
		expect(
			await rejection(auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID', reason: 'throttled' });
	});

	it('refuses an unverified user with an active second factor before the challenge', async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 26));
		const auth = janus({
			user: person,
			password: { login: 'email', requireVerifiedEmail: true },
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
		clock.advance(30_000);

		const error = await rejection(auth.signIn({ email: ada.email, password }));

		expect(error).toMatchObject({ code: 'EMAIL_UNVERIFIED' });
	});

	it('refuses an inactive user as USER_INACTIVE first', async () => {
		const { auth } = strict();
		const { user } = await auth.signUp({ ...ada, password });
		await auth.setActive(user, false);

		expect(
			await rejection(auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'USER_INACTIVE' });
	});
});

describe('password.requireVerifiedEmail, a user with no e-mail', () => {
	it('is a wiring TypeError after the right password, not a lock-out', async () => {
		const auth = janus({
			user: z.object({ username: z.string(), email: z.email().optional() }),
			password: { login: 'username', requireVerifiedEmail: true },
			store: createMemoryStores(),
			hasher,
		} as never) as unknown as {
			create(input: unknown): Promise<unknown>;
			signIn(input: unknown): Promise<unknown>;
		};
		await auth.create({ username: 'ada', password });

		expect(
			await rejection(auth.signIn({ username: 'ada', password })),
		).toBeInstanceOf(TypeError);
		expect(
			await rejection(auth.signIn({ username: 'ada', password: 'wrong one!' })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID' });
	});
});
