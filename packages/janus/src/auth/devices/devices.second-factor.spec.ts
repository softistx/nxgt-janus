import { describe, expect, it } from 'bun:test';
import { credentials, setup, withFactor } from './devices.fixtures';

/** Signs in with an active factor, and answers the challenge. */
async function challenge(auth: ReturnType<typeof setup>['auth']) {
	const result = await auth.signIn(credentials, { device: null });
	if (result.status !== 'secondFactor') throw new Error('expected a challenge');
	return result.challenge;
}

describe('signIn, with an active second factor', () => {
	it('answers the challenge alone: no device yet, no event', async () => {
		const context = setup();
		await withFactor(context);

		const result = await context.auth.signIn(credentials, { device: null });

		expect(result.status).toBe('secondFactor');
		expect(result).not.toHaveProperty('deviceToken');
		expect(context.newDevices()).toEqual([]);
	});
});

describe('secondFactor.confirm, given the device again', () => {
	it('from a new device: new, a token, and the event', async () => {
		const context = setup();
		const { codeNow } = await withFactor(context);
		const { auth, newDevices } = context;

		const signed = await auth.secondFactor.confirm(
			await challenge(auth),
			codeNow(),
			{ device: null },
		);

		expect(signed.newDevice).toBe(true);
		expect(signed.deviceToken).toStartWith('d1.');
		expect(newDevices()).toMatchObject([{ sessionId: signed.session.id }]);
	});

	it('from the device Ada signed up on: known, no event', async () => {
		const context = setup();
		const { codeNow, deviceToken } = await withFactor(context);
		const { auth, newDevices } = context;

		const signed = await auth.secondFactor.confirm(
			await challenge(auth),
			codeNow(),
			{ device: deviceToken },
		);

		expect(signed).toMatchObject({ newDevice: false, deviceToken });
		expect(newDevices()).toEqual([]);
	});

	it('not given it again: untracked, whatever signIn was given', async () => {
		const context = setup();
		const { codeNow } = await withFactor(context);
		const { auth, newDevices } = context;

		const signed = await auth.secondFactor.confirm(
			await challenge(auth),
			codeNow(),
		);

		expect(signed).toMatchObject({ newDevice: false, deviceToken: null });
		expect(newDevices()).toEqual([]);
	});
});

describe('secondFactor.recover, given the device again', () => {
	it('from a new device: new, after the recovery code is reported used', async () => {
		const context = setup();
		const { recoveryCodes } = await withFactor(context);
		const { auth, types } = context;

		const signed = await auth.secondFactor.recover(
			await challenge(auth),
			recoveryCodes[0] as string,
			{ device: null },
		);

		expect(signed).toMatchObject({ newDevice: true, recoveryCodesLeft: 9 });
		expect(types().slice(-2)).toEqual([
			'user.recoveryCodeUsed',
			'user.newDeviceSignedIn',
		]);
	});

	it('from a known device: no event', async () => {
		const context = setup();
		const { recoveryCodes, deviceToken } = await withFactor(context);
		const { auth, newDevices } = context;

		const signed = await auth.secondFactor.recover(
			await challenge(auth),
			recoveryCodes[0] as string,
			{ device: deviceToken },
		);

		expect(signed).toMatchObject({ newDevice: false, deviceToken });
		expect(newDevices()).toEqual([]);
	});
});
