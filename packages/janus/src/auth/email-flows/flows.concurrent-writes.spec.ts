import { describe, expect, it } from 'bun:test';
import { ada, hasher, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import { changingEmailAfterRedeem } from './changing-email.fixtures';

describe('an e-mail changed while a link is redeemed', () => {
	it('verifies nothing', async () => {
		const store = changingEmailAfterRedeem('countess@example.test');
		const { auth } = setup({ store });
		const { user } = await auth.signUp({ ...ada, password });
		const sent = await auth.verifyEmail.send(user);

		expect(await rejection(auth.verifyEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_STALE' },
		);
		expect((await auth.get(user.id)).emailVerified).toBe(false);
	});

	it('resets no password', async () => {
		const store = changingEmailAfterRedeem('countess@example.test');
		const { auth } = setup({ store });
		const { user } = await auth.signUp({ ...ada, password });
		const sent = await auth.resetPassword.request(ada.email);

		expect(
			await rejection(
				auth.resetPassword.confirm(sent?.token ?? '', 'brand new password'),
			),
		).toMatchObject({ code: 'TOKEN_STALE' });
		// The password is the one it was: it still signs in, under the new e-mail.
		expect(
			(await auth.signIn({ email: 'countess@example.test', password })).user.id,
		).toBe(user.id);
	});
});

describe('a password written while a sign-in runs', () => {
	it('refuses the sign-in, and revokes the session it opened', async () => {
		const memory = createMemoryStores();
		const opened: string[] = [];
		// The password is written after the session is opened, before signIn
		// reads the user again: the order a reset can land in.
		const store: JanusStores = {
			...memory,
			sessions: {
				...memory.sessions,
				async insertSession(record) {
					await memory.sessions.insertSession(record);
					opened.push(record.tokenHash);
					const user = await memory.users.findUser(record.userId);
					if (user?.password) {
						await memory.users.updateUser(
							user.id,
							{
								password: {
									hash: await hasher.hash('written meanwhile'),
									updatedAt: user.updatedAt,
								},
								updatedAt: user.updatedAt,
							},
							user.version,
						);
					}
				},
			},
		};
		const { auth } = setup({ store });
		await auth.create({ ...ada, password });
		opened.length = 0;

		expect(
			await rejection(auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID' });
		const session = await memory.sessions.findSessionByTokenHash(
			opened[0] ?? '',
		);
		expect(session?.revokedAt).not.toBeNull();
	});
});

describe('an e-mail changed while a change of e-mail is redeemed', () => {
	it('moves nobody: TOKEN_STALE, the former address kept by the other write', async () => {
		const store = changingEmailAfterRedeem('other@example.test');
		const { auth } = setup({ store });
		const { user } = await auth.signUp({ ...ada, password });
		const sent = await auth.changeEmail.send(user, 'countess@example.test');

		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_STALE' },
		);
		expect((await auth.get(user.id)).email).toBe('other@example.test');
	});
});
