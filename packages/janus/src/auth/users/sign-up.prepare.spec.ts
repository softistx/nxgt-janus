import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { setupPrepared } from './sign-up.prepare.fixtures';

describe('signUp.prepare', () => {
	it('writes nothing in prepare: no user, no token, no session', async () => {
		const { auth, store, issued, sessions } = setupPrepared();

		await auth.signUp.prepare({ ...ada, password });

		expect(await auth.findByLogin(ada.email)).toBeNull();
		expect(issued).toEqual([]);
		expect(sessions).toEqual([]);
		expect(store).toBeDefined();
	});

	it('send() creates the user and issues a verification token, with no session', async () => {
		const { auth, issued, sessions } = setupPrepared();
		const pending = await auth.signUp.prepare({ ...ada, password });

		const outcome = await pending.send();

		if (outcome.status !== 'created') throw new Error('expected created');
		expect(outcome.user).toMatchObject({ ...ada, emailVerified: false });
		expect(outcome.issued).toMatchObject({ email: ada.email });
		expect(issued).toEqual(['verifyEmail']);
		expect(sessions).toEqual([]);
		// The token verifies the address, and then the sign-in is allowed.
		await auth.verifyEmail.confirm(outcome.issued.token);
		expect(await auth.signIn({ email: ada.email, password })).toMatchObject({
			user: { id: outcome.user.id, emailVerified: true },
		});
	});

	it('send() answers taken for a login already held, writing and issuing nothing', async () => {
		const { auth, issued } = setupPrepared();
		const first = await (
			await auth.signUp.prepare({ ...ada, password })
		).send();
		if (first.status !== 'created') throw new Error('expected created');

		const again = await auth.signUp.prepare({
			...ada,
			email: 'ADA@example.test',
			name: 'Someone else',
			password: 'another password',
		});
		const outcome = await again.send();

		expect(outcome).toMatchObject({
			status: 'taken',
			user: { id: first.user.id, name: ada.name },
		});
		expect(outcome).not.toHaveProperty('issued');
		expect(issued).toEqual(['verifyEmail']);
		// The holder's password is untouched.
		await auth.verifyEmail.confirm(first.issued.token);
		expect(await auth.signIn({ email: ada.email, password })).toBeDefined();
	});

	it('validates the fields and the password policy in prepare, before any lookup', async () => {
		const { auth } = setupPrepared();

		expect(
			await rejection(
				auth.signUp.prepare({ ...ada, email: 'not an e-mail', password }),
			),
		).toMatchObject({ code: 'USER_INVALID' });
		expect(
			await rejection(auth.signUp.prepare({ ...ada, password: 'short' })),
		).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
		// A taken address is refused alike: the weak password is never reached by a lookup.
		await (await auth.signUp.prepare({ ...ada, password })).send();
		expect(
			await rejection(auth.signUp.prepare({ ...ada, password: 'short' })),
		).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
	});

	it('counts the attempt per address in prepare, new or taken alike', async () => {
		const { auth, issued } = setupPrepared({ throttle: { attempts: 2 } });
		await (await auth.signUp.prepare({ ...ada, password })).send();

		await auth.signUp.prepare({ ...ada, password });
		const refused = await rejection(auth.signUp.prepare({ ...ada, password }));
		const other = await rejection(
			(async () => {
				await auth.signUp.prepare({
					...ada,
					email: 'bob@example.test',
					password,
				});
				await auth.signUp.prepare({
					...ada,
					email: 'bob@example.test',
					password,
				});
				return auth.signUp.prepare({
					...ada,
					email: 'bob@example.test',
					password,
				});
			})(),
		);

		expect(refused).toMatchObject({ code: 'MAIL_THROTTLED' });
		expect((refused as { retryAfter: number }).retryAfter).toBeGreaterThan(0);
		// A fresh address has its own count, refused past its own limit.
		expect(other).toMatchObject({ code: 'MAIL_THROTTLED' });
		expect(issued).toEqual(['verifyEmail']);
	});

	it('send() runs once', async () => {
		const { auth } = setupPrepared();
		const pending = await auth.signUp.prepare({ ...ada, password });
		await pending.send();

		const error = await rejection(pending.send());

		expect(error).toBeInstanceOf(TypeError);
		expect((error as Error).message).toContain('signUp.prepare');
	});

	it('leaves signUp as it was: a session, and LOGIN_TAKEN for a taken login', async () => {
		const { auth } = setupPrepared();
		const { session } = await auth.signUp({ ...ada, password });
		expect(session.userId).toBeDefined();

		expect(await rejection(auth.signUp({ ...ada, password }))).toMatchObject({
			code: 'LOGIN_TAKEN',
		});
	});
});
