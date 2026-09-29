import { describe, expect, it } from 'bun:test';
import { ada, hasher, password, person, setup } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { StoreFailure } from '../errors/janus-error';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import type { JanusStores } from './port/types';

/** The reference stores, with one token method failing as a driver would. */
function failingTokens(method: keyof JanusStores['tokens']): JanusStores {
	const stores = createMemoryStores();
	return {
		...stores,
		tokens: {
			...stores.tokens,
			[method]: async () => {
				throw new Error('connection refused');
			},
		},
	};
}

describe('magicLink.confirm', () => {
	it('refuses an unknown, a lapsed or a stale token, and an inactive user — each spent', async () => {
		const { auth, clock } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		expect(await rejection(auth.magicLink.confirm('nope'))).toMatchObject({
			code: 'TOKEN_UNKNOWN',
			message: 'magicLink.confirm: no such token',
		});

		const lapsed = await auth.magicLink.request(ada.email);
		clock.advance(15 * 60_000);
		expect(
			await rejection(auth.magicLink.confirm(lapsed?.token ?? '')),
		).toMatchObject({ code: 'TOKEN_EXPIRED' });

		const stale = await auth.magicLink.request(ada.email);
		await auth.update(user, { email: 'lovelace@example.test' });
		expect(
			await rejection(auth.magicLink.confirm(stale?.token ?? '')),
		).toMatchObject({
			code: 'TOKEN_STALE',
			message:
				'magicLink.confirm: the token was sent to an e-mail the user no longer has',
		});

		const inactive = await auth.magicLink.request('lovelace@example.test');
		await auth.setActive(user, false);
		expect(
			await rejection(auth.magicLink.confirm(inactive?.token ?? '')),
		).toMatchObject({ code: 'USER_INACTIVE' });
		await auth.setActive(user, true);
		for (const spent of [stale, inactive]) {
			expect(
				await rejection(auth.magicLink.confirm(spent?.token ?? '')),
			).toMatchObject({ code: 'TOKEN_SPENT' });
		}
	});

	it("never takes a sign-in code's challenge as a link, nor a link as a challenge", async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		// Whoever asks for a code holds its challenge: a link would need nothing more.
		const code = await auth.signInCode.request(ada.email);
		const link = await auth.magicLink.request(ada.email);

		expect(
			await rejection(auth.magicLink.confirm(code?.challenge ?? '')),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect(
			await rejection(auth.signInCode.confirm(link?.token ?? '', '000000')),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect(
			await rejection(auth.verifyEmail.confirm(link?.token ?? '')),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		// Neither was touched by the other's confirm.
		expect((await auth.magicLink.confirm(link?.token ?? '')).status).toBe(
			'signedIn',
		);
		expect(
			(await auth.signInCode.confirm(code?.challenge ?? '', code?.code ?? ''))
				.status,
		).toBe('signedIn');
	});

	it('answers VERSION_CONFLICT when the user is written between the read and the proof — the link spent', async () => {
		const stores = createMemoryStores();
		let armed = false;
		const { auth } = setup({
			store: {
				...stores,
				users: {
					...stores.users,
					// Somebody else writes the user once confirm has read it.
					async findUser(id) {
						const found = await stores.users.findUser(id);
						if (found !== null && armed) {
							armed = false;
							await stores.users.updateUser(
								found.id,
								{ updatedAt: new Date(), fields: { ...ada, name: 'Ada King' } },
								found.version,
							);
						}
						return found;
					},
				},
			},
		});
		await auth.signUp({ ...ada, password });
		const issued = await auth.magicLink.request(ada.email);

		armed = true;
		expect(
			await rejection(auth.magicLink.confirm(issued?.token ?? '')),
		).toMatchObject({
			code: 'VERSION_CONFLICT',
			message: expect.stringMatching(
				/^magicLink\.confirm: expected version \d+, found \d+$/,
			),
		});
		expect(
			await rejection(auth.magicLink.confirm(issued?.token ?? '')),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it("answers another type's link as unknown, naming nobody — and spends it", async () => {
		const auth = janus({
			users: {
				patient: { schema: person, password: { login: 'email' } },
				member: { schema: person, password: { login: 'email' } },
			},
			store: createMemoryStores(),
			hasher,
		});
		await auth.patient.signUp({ ...ada, password });
		const issued = await auth.patient.magicLink.request(ada.email);

		expect(
			await rejection(auth.member.magicLink.confirm(issued?.token ?? '')),
		).toMatchObject({
			code: 'TOKEN_UNKNOWN',
			message: 'member.magicLink.confirm: no such token',
			userId: undefined,
		});
		expect(
			await rejection(auth.patient.magicLink.confirm(issued?.token ?? '')),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});
});

describe('magicLink, when the store fails', () => {
	it('request rejects with STORE_FAILED, never null', async () => {
		for (const method of ['insertToken', 'spendUserTokens'] as const) {
			const { auth } = setup({ store: failingTokens(method) });
			await auth.signUp({ ...ada, password });

			const error = await rejection(auth.magicLink.request(ada.email));

			expect(error).toBeInstanceOf(StoreFailure);
			expect(error).toMatchObject({ code: 'STORE_FAILED', operation: method });
		}
	});

	it('confirm rejects with STORE_FAILED, never TOKEN_UNKNOWN', async () => {
		const { auth } = setup({ store: failingTokens('consumeToken') });

		const error = await rejection(auth.magicLink.confirm('any token'));

		expect(error).toBeInstanceOf(StoreFailure);
		expect(error).toMatchObject({ slot: 'tokens', operation: 'consumeToken' });
	});
});
