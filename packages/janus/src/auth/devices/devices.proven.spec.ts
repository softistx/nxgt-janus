import { describe, expect, it } from 'bun:test';
import { bearer } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { setup, signedUp, withFactor } from './devices.fixtures';

describe('signInProven, given a device', () => {
	it('from a new device: new, a token to keep, and the event', async () => {
		const context = setup();
		const { user } = await signedUp(context.auth);

		const signed = await context.auth.signInProven(user.id, { device: null });

		if (signed.status !== 'signedIn') throw new Error('expected a session');
		expect(signed.newDevice).toBe(true);
		expect(typeof signed.deviceToken).toBe('string');
		expect(context.newDevices()).toMatchObject([
			{ userId: user.id, sessionId: signed.session.id },
		]);
	});

	it('from a known device: the same token, and no event', async () => {
		const context = setup();
		const { user, deviceToken } = await signedUp(context.auth);

		const signed = await context.auth.signInProven(user.id, {
			device: deviceToken,
		});

		expect(signed).toMatchObject({ newDevice: false, deviceToken });
		expect(context.newDevices()).toEqual([]);
	});

	it('with no device: untracked', async () => {
		const context = setup();
		const { user } = await signedUp(context.auth);

		const signed = await context.auth.signInProven(user.id);

		expect(signed).toMatchObject({ newDevice: false, deviceToken: null });
		expect(context.newDevices()).toEqual([]);
	});

	it('refused for an inactive user: no event', async () => {
		const context = setup();
		const { user } = await signedUp(context.auth);
		await context.auth.setActive(user, false);

		await rejection(context.auth.signInProven(user.id, { device: null }));

		expect(context.newDevices()).toEqual([]);
	});
});

describe('signInProven, with an active second factor', () => {
	it('answers a challenge, and the session only once its code is confirmed', async () => {
		const context = setup();
		const { user, codeNow } = await withFactor(context);
		const { auth } = context;

		const result = await auth.signInProven(user.id, { device: null });

		expect(result).toMatchObject({ status: 'secondFactor', userId: user.id });
		expect('token' in result).toBe(false);
		expect(context.newDevices()).toEqual([]);
		if (result.status !== 'secondFactor') throw new Error('expected a factor');
		const signed = await auth.secondFactor.confirm(
			result.challenge,
			codeNow(),
			{
				device: null,
			},
		);
		expect((await auth.authenticate(bearer(signed.token)))?.user.id).toBe(
			user.id,
		);
		expect(context.newDevices()).toHaveLength(1);
	});

	it('keeps the factor: the proof is a first factor, never a second', async () => {
		const context = setup();
		const { user } = await withFactor(context);

		await context.auth.signInProven(user.id);

		expect((await context.auth.get(user.id)).hasSecondFactor).toBe(true);
	});

	it('refuses an inactive user before any challenge is issued', async () => {
		const context = setup();
		const { user } = await withFactor(context);
		await context.auth.setActive(user, false);

		expect(await rejection(context.auth.signInProven(user.id))).toMatchObject({
			code: 'USER_INACTIVE',
		});
	});
});
