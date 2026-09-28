import { describe, expect, it } from 'bun:test';
import { challenged, enrolled, setup } from '../../../test/second-factor';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

describe('secondFactor.recover, twice at once', () => {
	it('opens one session for a code used twice at once: the other write is VERSION_CONFLICT', async () => {
		const store = barrierOnReads(createMemoryStores(), 2);
		const used: string[] = [];
		const context = setup({
			store: store.stores,
			events: (event) => {
				if (event.type === 'user.recoveryCodeUsed') used.push(event.userId);
			},
		});
		const { auth } = context;
		const { recoveryCodes, user } = await enrolled(context);
		const [code = ''] = recoveryCodes;
		const challenges = [await challenged(auth), await challenged(auth)];

		store.arm();
		const outcomes = await Promise.all(
			challenges.map((challenge) =>
				auth.secondFactor.recover(challenge, code).then(outcome, refusal),
			),
		);

		expect(outcomes.sort()).toEqual(['VERSION_CONFLICT', 'signedIn']);
		expect(used).toEqual([user.id]);
		const stored = await context.store.users.findUser(user.id);
		expect(stored?.secondFactor?.recoveryCodes).toHaveLength(9);
	});

	it('spends two different codes on one challenge when the second is written before the first spends it', async () => {
		const store = holdFirstSpend(createMemoryStores());
		const used: string[] = [];
		const context = setup({
			store: store.stores,
			events: (event) => {
				if (event.type === 'user.recoveryCodeUsed') used.push(event.userId);
			},
		});
		const { auth } = context;
		const { recoveryCodes, user } = await enrolled(context);
		const [first = '', second = ''] = recoveryCodes;
		const challenge = await challenged(auth);

		store.arm();
		const held = auth.secondFactor
			.recover(challenge, first)
			.then(outcome, refusal);
		await store.reached;
		const late = await auth.secondFactor
			.recover(challenge, second)
			.then(outcome, refusal);
		store.release();

		expect([await held, late]).toEqual(['TOKEN_SPENT', 'signedIn']);
		expect(used).toEqual([user.id, user.id]);
		const stored = await context.store.users.findUser(user.id);
		expect(stored?.secondFactor?.recoveryCodes).toHaveLength(8);
	});
});

const outcome = (signedIn: { status: string }) => signedIn.status;
const refusal = (error: { code?: string }) => error.code;

/**
 * A store whose `findUser` holds, once armed, until `count` calls are
 * waiting: both redemptions read the same version before either writes.
 */
function barrierOnReads(stores: JanusStores, count: number) {
	let armed = false;
	let waiting: (() => void)[] = [];
	const findUser = stores.users.findUser.bind(stores.users);
	const users = {
		...stores.users,
		findUser: async (id: Parameters<typeof findUser>[0]) => {
			const record = await findUser(id);
			if (!armed) return record;
			await new Promise<void>((release) => {
				waiting.push(release);
				if (waiting.length === count) {
					for (const one of waiting) one();
					waiting = [];
					armed = false;
				}
			});
			return record;
		},
	};
	return {
		stores: { ...stores, users },
		arm: () => {
			armed = true;
		},
	};
}

/**
 * A store whose first `consumeToken`, once armed, waits for `release()`:
 * that redemption has written its code away but not spent the challenge.
 * `reached` settles when it is waiting.
 */
function holdFirstSpend(stores: JanusStores) {
	let armed = false;
	let arrive = () => {};
	let release = () => {};
	const reached = new Promise<void>((resolve) => {
		arrive = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const consumeToken = stores.tokens.consumeToken.bind(stores.tokens);
	const tokens = {
		...stores.tokens,
		consumeToken: async (...args: Parameters<typeof consumeToken>) => {
			if (armed) {
				armed = false;
				arrive();
				await gate;
			}
			return consumeToken(...args);
		},
	};
	return {
		stores: { ...stores, tokens },
		arm: () => {
			armed = true;
		},
		reached,
		release: () => release(),
	};
}
