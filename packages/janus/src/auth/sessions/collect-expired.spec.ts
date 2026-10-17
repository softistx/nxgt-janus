import { describe, expect, it } from 'bun:test';
import { ada, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { StoreFailure } from '../../errors/janus-error';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

const DAY = 24 * 3_600_000;

/** The memory stores, minus the collectors `without` names, and with what each one is asked. */
function recording(without: 'sessions' | 'tokens' | 'both' | 'none') {
	const memory = createMemoryStores();
	const { deleteExpiredSessions, ...sessions } = memory.sessions;
	const { deleteExpiredTokens, ...tokens } = memory.tokens;
	const asked: { slot: string; before: Date }[] = [];
	const store: JanusStores = {
		...memory,
		sessions:
			without === 'sessions' || without === 'both'
				? sessions
				: {
						...sessions,
						deleteExpiredSessions: async (before) => {
							asked.push({ slot: 'sessions', before });
							return deleteExpiredSessions?.(before) ?? 0;
						},
					},
		tokens:
			without === 'tokens' || without === 'both'
				? tokens
				: {
						...tokens,
						deleteExpiredTokens: async (before) => {
							asked.push({ slot: 'tokens', before });
							return deleteExpiredTokens?.(before) ?? 0;
						},
					},
	};
	return { store, asked };
}

/** One lapsed session and, past a link's lifetime, one lapsed reset token. */
async function lapsed(without: Parameters<typeof recording>[0]) {
	const { store, asked } = recording(without);
	const context = setup({ store });
	await context.auth.signUp({ ...ada, password });
	await context.auth.resetPassword.request(ada.email);
	context.clock.advance(8 * DAY);
	return { ...context, asked };
}

describe('collectExpired', () => {
	it('adds the lapsed sessions and the lapsed tokens, sessions first, both asked at clock.now()', async () => {
		const { auth, clock, asked } = await lapsed('none');

		expect(await auth.collectExpired()).toBeGreaterThanOrEqual(2);

		expect(asked.map((call) => call.slot)).toEqual(['sessions', 'tokens']);
		for (const call of asked)
			expect(call.before.getTime()).toBe(clock.now().getTime());
		expect(await auth.collectExpired()).toBe(0);
	});

	it('collects the sessions alone when the tokens store has no collector', async () => {
		const { auth, asked } = await lapsed('tokens');

		expect(await auth.collectExpired()).toBe(1);
		expect(asked.map((call) => call.slot)).toEqual(['sessions']);
	});

	it('collects the tokens alone when the sessions store has no collector', async () => {
		const { auth, asked } = await lapsed('sessions');

		expect(await auth.collectExpired()).toBeGreaterThanOrEqual(1);
		expect(asked.map((call) => call.slot)).toEqual(['tokens']);
	});

	it('says UNSUPPORTED, naming the sessions slot, when neither store can', async () => {
		const { auth } = await lapsed('both');

		const error = await rejection(auth.collectExpired());

		expect(error).toMatchObject({
			code: 'UNSUPPORTED',
			slot: 'sessions',
			operation: 'deleteExpiredSessions',
			message:
				'collectExpired: store.sessions does not implement deleteExpiredSessions, nor store.tokens deleteExpiredTokens — their stores expire records on their own, or implement the methods',
		});
	});

	it('fails with STORE_FAILED when the tokens collector throws, after the sessions went', async () => {
		const memory = createMemoryStores();
		const store: JanusStores = {
			...memory,
			tokens: {
				...memory.tokens,
				deleteExpiredTokens: async () => {
					throw new Error('connection reset');
				},
			},
		};
		const { auth, clock } = setup({ store });
		await auth.signUp({ ...ada, password });
		clock.advance(8 * DAY);

		const error = await rejection(auth.collectExpired());

		expect(error).toBeInstanceOf(StoreFailure);
		expect(error).toMatchObject({ code: 'STORE_FAILED', slot: 'tokens' });
		expect(await memory.sessions.deleteExpiredSessions?.(clock.now())).toBe(0);
	});
});
