import { describe, expect, it } from 'bun:test';
import { bearer } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import { challenged, enrolled, setup } from './flows.fixtures';

describe('secondFactor.recover', () => {
	it('answers ten codes at activation, and stores only their keyed hashes', async () => {
		const context = setup();
		const { recoveryCodes, user } = await enrolled(context);

		expect(recoveryCodes).toHaveLength(10);
		const stored = (await context.store.users.findUser(user.id))?.secondFactor;
		expect(stored?.recoveryCodes).toHaveLength(10);
		for (const [index, hash] of (stored?.recoveryCodes ?? []).entries()) {
			expect(hash).toStartWith('v1.k1.');
			expect(hash).not.toContain((recoveryCodes[index] ?? '').replace('-', ''));
		}
	});

	it('opens the session with a recovery code, spends it, and says how many are left', async () => {
		const context = setup();
		const { auth } = context;
		const { recoveryCodes, user } = await enrolled(context);
		const [code = ''] = recoveryCodes;

		const signedIn = await auth.secondFactor.recover(
			await challenged(auth),
			code,
		);

		expect(signedIn).toMatchObject({
			status: 'signedIn',
			user: { id: user.id, hasSecondFactor: true },
			recoveryCodesLeft: 9,
		});
		expect((await auth.authenticate(bearer(signedIn.token)))?.user.id).toBe(
			user.id,
		);
		const stored = await context.store.users.findUser(user.id);
		expect(stored?.secondFactor?.recoveryCodes).toHaveLength(9);
		expect(
			await rejection(auth.secondFactor.recover(await challenged(auth), code)),
		).toMatchObject({ code: 'CODE_INVALID', attemptsLeft: 4 });
	});

	it('accepts a code however it is typed', async () => {
		const context = setup();
		const { auth } = context;
		const { recoveryCodes } = await enrolled(context);
		const typed = ` ${(recoveryCodes[3] ?? '').toUpperCase().replace('-', ' ')} `;

		const signedIn = await auth.secondFactor.recover(
			await challenged(auth),
			typed,
		);

		expect(signedIn.recoveryCodesLeft).toBe(9);
	});

	it("counts attempts on the challenge as confirm does, and never takes the app's code", async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, recoveryCodes } = await enrolled(context);
		const challenge = await challenged(auth);

		expect(
			await rejection(auth.secondFactor.recover(challenge, codeOf(secret))),
		).toMatchObject({ code: 'CODE_INVALID', attemptsLeft: 4 });
		expect(
			await rejection(auth.secondFactor.confirm(challenge, 'zzzzz-zzzzz')),
		).toMatchObject({ code: 'CODE_INVALID', attemptsLeft: 3 });
		for (const attemptsLeft of [2, 1, 0]) {
			expect(
				await rejection(auth.secondFactor.recover(challenge, 'zzzzz-zzzzz')),
			).toMatchObject({ code: 'CODE_INVALID', attemptsLeft });
		}
		expect(
			await rejection(
				auth.secondFactor.recover(challenge, recoveryCodes[0] ?? ''),
			),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('opens one session for a code used twice at once: the other write is VERSION_CONFLICT', async () => {
		const store = barrierOnReads(createMemoryStores(), 2);
		const context = setup({ store: store.stores });
		const { auth } = context;
		const { recoveryCodes, user } = await enrolled(context);
		const [code = ''] = recoveryCodes;
		const challenges = [await challenged(auth), await challenged(auth)];

		store.arm();
		const outcomes = await Promise.all(
			challenges.map((challenge) =>
				auth.secondFactor.recover(challenge, code).then(
					(signedIn) => signedIn.status,
					(error: { code?: string }) => error.code,
				),
			),
		);

		expect(outcomes.sort()).toEqual(['VERSION_CONFLICT', 'signedIn']);
		const stored = await context.store.users.findUser(user.id);
		expect(stored?.secondFactor?.recoveryCodes).toHaveLength(9);
	});

	it('refuses the codes a regeneration replaced, and those of a factor disabled', async () => {
		const context = setup();
		const { auth, codeOf, clock } = context;
		const { recoveryCodes, secret, user } = await enrolled(context);

		const fresh = await auth.secondFactor.regenerateRecoveryCodes(
			user,
			codeOf(secret),
		);
		clock.advance(30_000);
		expect(
			await rejection(
				auth.secondFactor.recover(
					await challenged(auth),
					recoveryCodes[0] ?? '',
				),
			),
		).toMatchObject({ code: 'CODE_INVALID' });

		await auth.secondFactor.disable(user);
		expect((await context.store.users.findUser(user.id))?.secondFactor).toBe(
			null,
		);
		const { secret: again } = await auth.secondFactor.enroll(user);
		await auth.secondFactor.activate(user, codeOf(again));
		expect(
			await rejection(
				auth.secondFactor.recover(
					await challenged(auth),
					fresh.recoveryCodes[0] ?? '',
				),
			),
		).toMatchObject({ code: 'CODE_INVALID' });
	});

	it('refuses a user deactivated since signIn, and spends the challenge', async () => {
		const context = setup();
		const { auth } = context;
		const { recoveryCodes, user } = await enrolled(context);
		const challenge = await challenged(auth);
		await auth.setActive(user, false);

		expect(
			await rejection(
				auth.secondFactor.recover(challenge, recoveryCodes[0] ?? ''),
			),
		).toMatchObject({ code: 'USER_INACTIVE' });
		const stored = await context.store.users.findUser(user.id);
		expect(stored?.secondFactor?.recoveryCodes).toHaveLength(10);
	});
});

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
