import { describe, expect, it } from 'bun:test';
import { ada } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { credentials, setup, signedUp, withFactor } from './devices.fixtures';

/**
 * A device given to a confirmation of a janus() wired without devices is
 * refused before the one-time proof is spent: the same proof still signs in.
 */

const noDevices =
	'a device was given, but janus() has no devices — pass devices: { keys }';

async function refusedFirst(call: () => Promise<unknown>, where: string) {
	const refused = await rejection(call());
	expect(refused).toBeInstanceOf(TypeError);
	expect((refused as Error).message).toBe(`${where}: ${noDevices}`);
}

/** Ada, her e-mail proved, on a janus() without devices. */
async function verified() {
	const context = setup({ untracked: true });
	const { user } = await signedUp(context.auth, {});
	const { token } = await context.auth.verifyEmail.send(user);
	await context.auth.verifyEmail.confirm(token);
	return context;
}

async function challenged() {
	const context = setup({ untracked: true });
	const factor = await withFactor(context, {});
	const result = await context.auth.signIn(credentials);
	if (result.status !== 'secondFactor') throw new Error('expected a challenge');
	return { ...context, ...factor, challenge: result.challenge };
}

describe('a confirmation given a device, on a janus() wired without devices', () => {
	it('signInCode.confirm: refused, and the code still signs in', async () => {
		const { auth } = await verified();
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');
		const { challenge, code } = issued;

		await refusedFirst(
			() => auth.signInCode.confirm(challenge, code, { device: null }),
			'signInCode.confirm',
		);
		expect(await auth.signInCode.confirm(challenge, code)).toMatchObject({
			status: 'signedIn',
		});
	});

	it('magicLink.confirm: refused, and the link still signs in', async () => {
		const { auth } = await verified();
		const issued = await auth.magicLink.request(ada.email);
		if (issued === null) throw new Error('expected a link');

		await refusedFirst(
			() => auth.magicLink.confirm(issued.token, { device: null }),
			'magicLink.confirm',
		);
		expect(await auth.magicLink.confirm(issued.token)).toMatchObject({
			status: 'signedIn',
		});
	});

	it('secondFactor.confirm: refused, and the challenge still confirms', async () => {
		const { auth, challenge, codeNow } = await challenged();

		await refusedFirst(
			() => auth.secondFactor.confirm(challenge, codeNow(), { device: null }),
			'secondFactor.confirm',
		);
		expect(await auth.secondFactor.confirm(challenge, codeNow())).toMatchObject(
			{ status: 'signedIn' },
		);
	});

	it('secondFactor.recover: refused, and the recovery code still works', async () => {
		const { auth, challenge, recoveryCodes } = await challenged();
		const code = recoveryCodes[0] as string;

		await refusedFirst(
			() => auth.secondFactor.recover(challenge, code, { device: null }),
			'secondFactor.recover',
		);
		expect(await auth.secondFactor.recover(challenge, code)).toMatchObject({
			status: 'signedIn',
			recoveryCodesLeft: 9,
		});
	});
});
