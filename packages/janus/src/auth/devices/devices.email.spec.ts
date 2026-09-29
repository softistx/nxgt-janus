import { describe, expect, it } from 'bun:test';
import { ada } from '../../../test/auth';
import { setup, signedUp, withFactor } from './devices.fixtures';

/** Ada's e-mail proved once, so a sign-in by e-mail changes nothing else. */
async function verified(context: ReturnType<typeof setup>) {
	const { auth } = context;
	const signed = await signedUp(auth);
	const { token } = await auth.verifyEmail.send(signed.user);
	await auth.verifyEmail.confirm(token);
	return signed;
}

async function code(auth: ReturnType<typeof setup>['auth']) {
	const issued = await auth.signInCode.request(ada.email);
	if (issued === null) throw new Error('expected a code');
	return issued;
}

async function link(auth: ReturnType<typeof setup>['auth']) {
	const issued = await auth.magicLink.request(ada.email);
	if (issued === null) throw new Error('expected a link');
	return issued.token;
}

describe('signInCode.confirm, given a device', () => {
	it('from a new device: new, and the event', async () => {
		const context = setup();
		await verified(context);
		const { challenge, code: typed } = await code(context.auth);

		const signed = await context.auth.signInCode.confirm(challenge, typed, {
			device: null,
		});

		expect(signed).toMatchObject({ newDevice: true });
		expect(context.newDevices()).toHaveLength(1);
	});

	it('from a known device: no event', async () => {
		const context = setup();
		const { deviceToken } = await verified(context);
		const { challenge, code: typed } = await code(context.auth);

		const signed = await context.auth.signInCode.confirm(challenge, typed, {
			device: deviceToken,
		});

		expect(signed).toMatchObject({ newDevice: false, deviceToken });
		expect(context.newDevices()).toEqual([]);
	});

	it('with an active factor: a challenge, and no event until its confirmation', async () => {
		const context = setup();
		await withFactor(context);
		const { auth } = context;
		const { token } = await auth.verifyEmail.send(
			(await auth.findByLogin(ada.email)) as { id: string },
		);
		await auth.verifyEmail.confirm(token);
		const { challenge, code: typed } = await code(auth);

		const result = await auth.signInCode.confirm(challenge, typed, {
			device: null,
		});

		expect(result.status).toBe('secondFactor');
		expect(context.newDevices()).toEqual([]);
	});
});

describe('magicLink.confirm, given a device', () => {
	it('from a new device: new, and the event', async () => {
		const context = setup();
		await verified(context);

		const signed = await context.auth.magicLink.confirm(
			await link(context.auth),
			{ device: null },
		);

		expect(signed).toMatchObject({ newDevice: true });
		expect(context.newDevices()).toHaveLength(1);
	});

	it('from a known device: no event', async () => {
		const context = setup();
		const { deviceToken } = await verified(context);

		const signed = await context.auth.magicLink.confirm(
			await link(context.auth),
			{ device: deviceToken },
		);

		expect(signed).toMatchObject({ newDevice: false, deviceToken });
		expect(context.newDevices()).toEqual([]);
	});

	it('proving the e-mail for the first time: the new device is reported last', async () => {
		const context = setup();
		await signedUp(context.auth);

		await context.auth.magicLink.confirm(await link(context.auth), {
			device: null,
		});

		expect(context.types().at(-1)).toBe('user.newDeviceSignedIn');
		expect(context.types()).toContain('user.emailVerified');
	});

	it('with no device: untracked', async () => {
		const context = setup();
		await verified(context);

		const signed = await context.auth.magicLink.confirm(
			await link(context.auth),
		);

		expect(signed).toMatchObject({ newDevice: false, deviceToken: null });
		expect(context.newDevices()).toEqual([]);
	});
});
