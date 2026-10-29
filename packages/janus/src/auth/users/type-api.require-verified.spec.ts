import { describe, expect, it } from 'bun:test';
import { ada, hasher, password, person } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { fixedClock } from '../../time/clock';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

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
