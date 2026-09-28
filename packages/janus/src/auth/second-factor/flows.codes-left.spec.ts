import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { challenged, enrolled, setup } from '../../../test/second-factor';
import type { UserEvent } from '../events';

describe('secondFactor.recoveryCodesLeft', () => {
	it('answers ten after activation, and one fewer for each code spent', async () => {
		const context = setup();
		const { auth } = context;
		const { recoveryCodes, user } = await enrolled(context);

		expect(await auth.secondFactor.recoveryCodesLeft(user)).toBe(10);
		for (const [spent, code] of recoveryCodes.slice(0, 2).entries()) {
			const signedIn = await auth.secondFactor.recover(
				await challenged(auth),
				code,
			);
			const left = await auth.secondFactor.recoveryCodesLeft(user.id);
			expect(left).toBe(signedIn.recoveryCodesLeft);
			expect(left).toBe(9 - spent);
		}
	});

	it('is read by a user.recoveryCodeUsed listener, after the code is spent', async () => {
		const read: (number | null)[] = [];
		const context = setup({
			async events(event: UserEvent) {
				if (event.type === 'user.recoveryCodeUsed') {
					read.push(
						await context.auth.secondFactor.recoveryCodesLeft(event.userId),
					);
				}
			},
		});
		const { auth } = context;
		const { recoveryCodes } = await enrolled(context);

		await auth.secondFactor.recover(
			await challenged(auth),
			recoveryCodes[0] ?? '',
		);

		expect(read).toEqual([9]);
	});

	it('answers null without an active factor: none, waiting, or disabled', async () => {
		const context = setup();
		const { auth } = context;
		const { user } = await auth.signUp({ ...ada, password });

		expect(await auth.secondFactor.recoveryCodesLeft(user)).toBeNull();
		await auth.secondFactor.enroll(user);
		expect(await auth.secondFactor.recoveryCodesLeft(user)).toBeNull();
		await auth.secondFactor.disable(user);
		expect(await auth.secondFactor.recoveryCodesLeft(user)).toBeNull();
	});

	it('answers 0, not null, once every code is spent', async () => {
		const context = setup();
		const { auth, store } = context;
		const { user } = await enrolled(context);
		const record = await store.users.findUser(user.id);
		const factor = record?.secondFactor;
		if (!record || !factor) throw new Error('expected an active factor');
		await store.users.updateUser(
			user.id,
			{
				secondFactor: { ...factor, recoveryCodes: [] },
				updatedAt: context.clock.now(),
			},
			record.version,
		);

		expect(await auth.secondFactor.recoveryCodesLeft(user)).toBe(0);
	});

	it('is NOT_FOUND for an unknown id, and writes nothing', async () => {
		const context = setup();
		const { auth, store } = context;
		const { user } = await enrolled(context);
		const before = await store.users.findUser(user.id);

		expect(
			await rejection(
				auth.secondFactor.recoveryCodesLeft(
					'0190e3b4-0000-7000-8000-000000000000',
				),
			),
		).toMatchObject({
			code: 'NOT_FOUND',
			operation: 'secondFactor.recoveryCodesLeft',
		});
		await auth.secondFactor.recoveryCodesLeft(user);
		expect((await store.users.findUser(user.id))?.version).toBe(
			before?.version,
		);
	});
});
