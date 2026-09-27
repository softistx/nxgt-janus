import { describe, expect, it } from 'bun:test';
import { ada, hasher, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

/**
 * A store where the user's e-mail changes **between the two reads** of a
 * redemption: after the token is spent and the user read once, before the
 * write reads them again — the gap a check made only on the first read
 * would miss.
 */
function changingEmailAfterRedeem(email: string): JanusStores {
	const store = createMemoryStores();
	let reads = -1;
	return {
		...store,
		tokens: {
			...store.tokens,
			async consumeToken(...args) {
				reads = 0;
				return store.tokens.consumeToken(...args);
			},
		},
		users: {
			...store.users,
			async findUser(id) {
				if (reads >= 0 && ++reads === 2) {
					const record = await store.users.findUser(id);
					if (record !== null) {
						await store.users.updateUser(
							id,
							{
								fields: { ...record.fields, email },
								logins: [email],
								updatedAt: record.updatedAt,
							},
							record.version,
						);
					}
				}
				return store.users.findUser(id);
			},
		},
	};
}

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
