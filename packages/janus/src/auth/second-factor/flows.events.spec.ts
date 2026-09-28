import { afterEach, describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { challenged, enrolled, setup } from '../../../test/second-factor';
import type { UserEvent } from '../events';
import { createMemoryStores } from '../port/memory';

/** An instance whose listener records what it hears. */
function listening() {
	const received: UserEvent[] = [];
	const context = setup({ events: (event) => void received.push(event) });
	const types = () => received.map((event) => event.type);
	return { ...context, received, types };
}

describe('secondFactor.activate', () => {
	it('reports the factor enabled once it is active, named by id alone', async () => {
		const context = listening();
		const { auth, clock, codeOf, received, types } = context;
		const { user } = await auth.signUp({ ...ada, password });
		const { secret } = await auth.secondFactor.enroll(user);
		// Enrolled, the factor waits for its first code: nothing is asked yet.
		expect(types()).toEqual(['user.created']);

		await auth.secondFactor.activate(user, codeOf(secret));

		expect(received.at(-1)).toEqual({
			id: expect.any(String),
			type: 'user.secondFactorEnabled',
			occurredAt: clock.now(),
			userId: user.id,
			userType: 'user',
		});
		expect(JSON.stringify(received)).not.toContain(secret);
	});

	it('reports nothing for a code refused', async () => {
		const { auth, types } = listening();
		const { user } = await auth.signUp({ ...ada, password });
		await auth.secondFactor.enroll(user);

		const refused = await rejection(auth.secondFactor.activate(user, '000000'));

		expect(refused).toMatchObject({ code: 'CODE_INVALID' });
		expect(types()).toEqual(['user.created']);
	});

	it('reports nothing for an activate refused: not enrolled, or already active', async () => {
		const context = listening();
		const { auth, codeOf, types } = context;
		const { user: bob } = await auth.signUp({
			...ada,
			email: 'bob@example.test',
			password,
		});
		const { user, secret } = await enrolled(context);

		const notEnrolled = await rejection(
			auth.secondFactor.activate(bob, '000000'),
		);
		const active = await rejection(
			auth.secondFactor.activate(user, codeOf(secret)),
		);

		expect(notEnrolled).toMatchObject({ code: 'SECOND_FACTOR_NOT_ENROLLED' });
		expect(active).toMatchObject({ code: 'SECOND_FACTOR_ACTIVE' });
		expect(
			types().filter((type) => type === 'user.secondFactorEnabled'),
		).toHaveLength(1);
	});
});

describe('secondFactor.disable', () => {
	it('reports an active factor disabled', async () => {
		const context = listening();
		const { auth, clock, received, types } = context;
		const { user } = await enrolled(context);

		await auth.secondFactor.disable(user);

		expect(types()).toEqual([
			'user.created',
			'user.secondFactorEnabled',
			'user.secondFactorDisabled',
		]);
		expect(received.at(-1)).toMatchObject({
			occurredAt: clock.now(),
			userId: user.id,
		});
	});

	it('reports nothing for a user who has no factor, nor on a second disable', async () => {
		const context = listening();
		const { auth, types } = context;
		const { user } = await enrolled(context);
		const { user: bob } = await auth.signUp({
			...ada,
			email: 'bob@example.test',
			password,
		});

		await auth.secondFactor.disable(bob);
		await auth.secondFactor.disable(user);
		await auth.secondFactor.disable(user);

		expect(types().filter((type) => type !== 'user.created')).toEqual([
			'user.secondFactorEnabled',
			'user.secondFactorDisabled',
		]);
	});

	it('reports nothing for a factor still waiting for its first code', async () => {
		const { auth, types } = listening();
		const { user } = await auth.signUp({ ...ada, password });
		await auth.secondFactor.enroll(user);

		const disabled = await auth.secondFactor.disable(user);

		expect(disabled.hasSecondFactor).toBe(false);
		expect(types()).toEqual(['user.created']);
	});

	it('reports nothing for a write refused under a stale version', async () => {
		const context = listening();
		const { auth, types } = context;
		const { user } = await enrolled(context);

		const refused = await rejection(
			auth.secondFactor.disable(user, { ifVersion: user.version }),
		);

		expect(refused).toMatchObject({ code: 'VERSION_CONFLICT' });
		expect(types()).not.toContain('user.secondFactorDisabled');
	});
});

describe('a listener that fails', () => {
	const warnings: string[] = [];
	const onWarning = (warning: Error) => void warnings.push(warning.message);
	afterEach(() => {
		process.off('warning', onWarning);
		warnings.length = 0;
	});

	it('fails neither activate nor disable: the factor is written all the same', async () => {
		process.on('warning', onWarning);
		const context = setup({
			events: () => {
				throw new Error('queue down');
			},
		});
		const { auth, store } = context;

		const { user } = await enrolled(context);
		const disabled = await auth.secondFactor.disable(user);

		expect(disabled.hasSecondFactor).toBe(false);
		expect((await store.users.findUser(user.id))?.secondFactor).toBeNull();
		await new Promise((resolve) => setImmediate(resolve));
		expect(warnings.join('\n')).toContain('user.secondFactorEnabled');
		expect(warnings.join('\n')).toContain('user.secondFactorDisabled');
	});
});

describe('recovery codes', () => {
	it('reports user.recoveryCodesRegenerated, and nothing for a refusal', async () => {
		const context = listening();
		const { auth, codeOf, types } = context;
		const { secret, user } = await enrolled(context);
		await rejection(auth.secondFactor.regenerateRecoveryCodes(user, 'x'));
		expect(types().at(-1)).toBe('user.secondFactorEnabled');

		await auth.secondFactor.regenerateRecoveryCodes(user, codeOf(secret));

		expect(types().at(-1)).toBe('user.recoveryCodesRegenerated');
	});

	it('reports user.recoveryCodeUsed once a code signed a user in, and nothing for one refused', async () => {
		const context = listening();
		const { auth, types } = context;
		const { recoveryCodes } = await enrolled(context);
		await rejection(
			auth.secondFactor.recover(await challenged(auth), 'zzzzz-zzzzz'),
		);
		expect(types().at(-1)).toBe('user.secondFactorEnabled');

		await auth.secondFactor.recover(
			await challenged(auth),
			recoveryCodes[0] ?? '',
		);

		expect(types().at(-1)).toBe('user.recoveryCodeUsed');
	});

	it('reports user.recoveryCodeUsed once the code is written, even when the session then fails to open', async () => {
		const stores = createMemoryStores();
		const failing = { on: false };
		const insertSession = stores.sessions.insertSession.bind(stores.sessions);
		const received: UserEvent[] = [];
		const context = setup({
			store: {
				...stores,
				sessions: {
					...stores.sessions,
					insertSession: (session) => {
						if (failing.on) throw new Error('sessions down');
						return insertSession(session);
					},
				},
			},
			events: (event) => void received.push(event),
		});
		const { recoveryCodes, user } = await enrolled(context);
		const challenge = await challenged(context.auth);
		failing.on = true;

		const failed = await rejection(
			context.auth.secondFactor.recover(challenge, recoveryCodes[0] ?? ''),
		);

		expect(failed).toMatchObject({ code: 'STORE_FAILED' });
		expect(received.at(-1)?.type).toBe('user.recoveryCodeUsed');
		expect(
			received.filter((event) => event.type === 'user.recoveryCodeUsed'),
		).toHaveLength(1);
		const stored = await stores.users.findUser(user.id);
		expect(stored?.secondFactor?.recoveryCodes).toHaveLength(9);
	});
});
