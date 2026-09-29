/**
 * What the device specs share: an instance with device keys, a second
 * factor and a listener that records what it hears. Specs only — no case
 * lives here.
 */

import { ada, hasher, password, person } from '../../../test/auth';
import { key } from '../../../test/second-factor';
import { fixedClock } from '../../time/clock';
import type { UserEvent } from '../events';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import type { SealingKey } from '../sealing';
import { codeAt, fromBase32, stepAt } from '../totp';

type Keys = readonly [SealingKey, ...SealingKey[]];

export const firstKeys: Keys = [{ id: 'd1', key: key(7) }];

export function setup(
	options: { readonly keys?: Keys; readonly store?: JanusStores } = {},
) {
	const clock = fixedClock(Date.UTC(2026, 8, 29));
	const store = options.store ?? createMemoryStores();
	const received: UserEvent[] = [];
	const auth = janus({
		user: person,
		password: { login: 'email' },
		store,
		hasher,
		clock,
		secondFactor: { issuer: 'Clinic', keys: [{ id: 'k1', key: key(1) }] },
		devices: { keys: options.keys ?? firstKeys },
		events: (event) => void received.push(event),
	});
	const types = () => received.map((event) => event.type);
	const newDevices = () =>
		received.filter((event) => event.type === 'user.newDeviceSignedIn');
	return { auth, clock, store, received, types, newDevices };
}

export const credentials = { email: ada.email, password };

/** Ada signed up on a device: the token that device keeps. */
export async function signedUp(auth: ReturnType<typeof setup>['auth']) {
	const { user, deviceToken } = await auth.signUp(
		{ ...ada, password },
		{ device: null },
	);
	return { user, deviceToken: deviceToken as string };
}

/** Ada with an active second factor, and the code her app shows now. */
export async function withFactor(context: ReturnType<typeof setup>) {
	const { auth, clock } = context;
	const { user, deviceToken } = await signedUp(auth);
	const { secret } = await auth.secondFactor.enroll(user);
	const now = () => codeAt(fromBase32(secret), stepAt(clock.now()));
	const { recoveryCodes } = await auth.secondFactor.activate(user, now());
	// The activation used this step's code: the next one is a new step.
	clock.advance(30_000);
	return { user, deviceToken, codeNow: now, recoveryCodes };
}
