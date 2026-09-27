import { describe, expect, it } from 'bun:test';
import { ada, password, rejection, setup } from '../../../test/auth';
import type { JanusError } from '../../errors/janus-error';

const HOUR = 3_600_000;

describe('verifyEmail', () => {
	it('sends a token for the current e-mail, and confirming it verifies the e-mail', async () => {
		const { auth, store } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const sent = await auth.verifyEmail.send(user);
		const verified = await auth.verifyEmail.confirm(sent.token);

		expect(sent.email).toBe(ada.email);
		expect(verified.emailVerified).toBe(true);
		// The store holds the hash of the token, never the token.
		expect(JSON.stringify(await store.users.findUser(user.id))).not.toContain(
			sent.token,
		);
	});

	it('refuses a token sent to an e-mail the user no longer has', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const sent = await auth.verifyEmail.send(user);
		await auth.update(user, { email: 'countess@example.test' });

		const error = (await rejection(
			auth.verifyEmail.confirm(sent.token),
		)) as JanusError;

		expect(error.code).toBe('TOKEN_STALE');
		expect((await auth.get(user.id)).emailVerified).toBe(false);
	});

	it('is single use, lapses, and names no secret in any refusal', async () => {
		const { auth, clock } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const used = await auth.verifyEmail.send(user);
		const lapsing = await auth.verifyEmail.send(user);
		await auth.verifyEmail.confirm(used.token);
		clock.advance(24 * HOUR);

		const refusals = [
			(await rejection(auth.verifyEmail.confirm(used.token))) as JanusError,
			(await rejection(auth.verifyEmail.confirm(lapsing.token))) as JanusError,
			(await rejection(auth.verifyEmail.confirm(lapsing.token))) as JanusError,
			(await rejection(auth.verifyEmail.confirm('forged'))) as JanusError,
		];

		expect(refusals.map((error) => error.code)).toEqual([
			'TOKEN_SPENT',
			'TOKEN_EXPIRED',
			'TOKEN_SPENT',
			'TOKEN_UNKNOWN',
		]);
		for (const error of refusals) {
			expect(error.message).not.toContain(used.token);
			expect(error.message).not.toContain(lapsing.token);
		}
	});
});
