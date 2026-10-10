/**
 * Device tokens: wired with no key, a device that is not a token, a cookie
 * that may be missing handed over as it is, a misspelled option, a token
 * read without its `null`, and a device given to a confirmation as a third
 * string. Cases 55–60 of the sixty-seven — see `fixtures.ts`. The shapes that must
 * keep compiling follow the refusals.
 */

import { z } from 'zod';
import { janus } from '../../../src/index';
import { hasher, one, store, twoFactor } from './fixtures';

const input = { email: 'a@b.test', password: 'secret123' };

async function devices(cookie: string | undefined) {
	// ── 55. Devices wired with no key ──────────────────────────────────────
	janus({
		user: z.object({ email: z.email() }),
		password: { login: 'email' },
		store,
		hasher,
		// @ts-expect-error a device token is signed: at least one key
		devices: { keys: [] },
	});

	// ── 56. A device that is not a token ───────────────────────────────────
	// @ts-expect-error the device token the client holds, or null
	await one.signIn(input, { device: 42 });

	// ── 57. A cookie that may be missing, handed over as it is ─────────────
	// `undefined` would mean "not tracked": a client with no cookie yet would
	// never be given a token. Write `cookie ?? null`.
	// @ts-expect-error undefined is not null: say the client holds no token
	await one.signIn(input, { device: cookie });

	// ── 58. A misspelled option ────────────────────────────────────────────
	// @ts-expect-error the option is device, singular
	await one.signIn(input, { devices: 'token' });

	// ── 59. A device token read without its null ───────────────────────────
	const signedIn = await one.signIn(input, { device: null });
	// @ts-expect-error null when no device was given: nothing to keep then
	const kept: string = signedIn.deviceToken;
	void kept;

	// ── 60. A device given to a confirmation as a third string ─────────────
	// @ts-expect-error options come third: { device }
	await twoFactor.patient.secondFactor.confirm('challenge', '123456', 'token');
}

/** What must keep compiling. */
async function allowedDevices(cookie: string | undefined) {
	const device = cookie ?? null;
	const signedUp = await one.signUp({ ...input, name: 'Ada' }, { device });
	const first: string | null = signedUp.deviceToken;

	const signedIn = await one.signIn(input, { device });
	const isNew: boolean = signedIn.newDevice;
	await one.signIn(input);
	await one.signInCode.confirm('challenge', '123456', { device });
	await one.magicLink.confirm('token', { device });

	const answer = await twoFactor.patient.signIn(input, { device });
	if (answer.status === 'secondFactor') {
		await twoFactor.patient.secondFactor.confirm(answer.challenge, '123456', {
			device,
		});
		const recovered = await twoFactor.patient.secondFactor.recover(
			answer.challenge,
			'abcde-fghij',
			{ device },
		);
		const left: number = recovered.recoveryCodesLeft;
		const again: string | null = recovered.deviceToken;
		void [left, again];
	}
	void [first, isNew];
}

export const checked = { devices, allowedDevices };
