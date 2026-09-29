import type { Context } from '../context';
import type { SignInOptions } from '../types';
import { knownDeviceToken, mintDeviceToken } from './token';

/**
 * What a sign-in was told of the device: `undefined` when nothing — devices
 * are not tracked for that call — `null` for a device holding no token yet,
 * or the token it presented.
 */
export type DeviceHint = string | null | undefined;

/** What a session-opening answer says of the device. */
export interface DeviceOutcome {
	readonly newDevice: boolean;
	readonly deviceToken: string | null;
}

/** No device given: nothing tracked, nothing minted. */
export const UNTRACKED: DeviceOutcome = Object.freeze({
	newDevice: false,
	deviceToken: null,
});

/**
 * The device a sign-in's options name. A JavaScript caller's `device` of
 * another type, and a device given to a `janus()` wired without `devices`,
 * are wiring mistakes — bare `TypeError`s. The value itself, whatever it
 * holds, is the client's, and never refused.
 */
export function deviceHint(
	context: Context,
	options: SignInOptions | undefined,
	where: string,
): DeviceHint {
	const device = options?.device;
	if (device === undefined) return undefined;
	if (device !== null && typeof device !== 'string') {
		throw new TypeError(
			`${where}: options.device must be the device token the client holds, or null when it holds none`,
		);
	}
	if (context.config.devices === null) {
		throw new TypeError(
			`${where}: a device was given, but janus() has no devices — pass devices: { keys }`,
		);
	}
	return device;
}

/**
 * Whether a session opening for `userId` comes from a new device, and the
 * token the client keeps from now on. A sign-up mints a token and is never
 * new: the account has no device to be new against.
 */
export function deviceOutcome(
	context: Context,
	userId: string,
	hint: DeviceHint,
	signUp: boolean,
): DeviceOutcome {
	const sealer = context.config.devices?.sealer;
	if (hint === undefined || sealer === undefined) return UNTRACKED;

	const known =
		hint === null || signUp ? null : knownDeviceToken(sealer, userId, hint);
	if (known !== null) return { newDevice: false, deviceToken: known };
	return {
		newDevice: !signUp,
		deviceToken: mintDeviceToken(sealer, userId),
	};
}
