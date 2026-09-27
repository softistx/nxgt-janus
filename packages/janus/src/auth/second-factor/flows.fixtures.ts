/**
 * The second factor's shared setup: an instance with keys and a fixed
 * clock, a user whose factor is active, and a sign-in stopped at its
 * challenge. Specs only — no case lives here.
 */

import { ada, hasher, password, person } from '../../../test/auth';
import { fixedClock } from '../../time/clock';
import type { UserEventListener } from '../events';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import { codeAt, fromBase32, stepAt } from '../totp';

export const key = (fill: number) => Buffer.alloc(32, fill).toString('base64');

export function setup(
	options: {
		store?: JanusStores;
		keys?: readonly [
			{ id: string; key: string },
			...{ id: string; key: string }[],
		];
		events?: UserEventListener;
	} = {},
) {
	const clock = fixedClock(Date.UTC(2026, 8, 26));
	const store = options.store ?? createMemoryStores();
	const auth = janus({
		user: person,
		password: { login: 'email' },
		store,
		hasher,
		clock,
		secondFactor: {
			issuer: 'Clinic',
			keys: options.keys ?? [{ id: 'k1', key: key(1) }],
		},
		...(options.events === undefined ? {} : { events: options.events }),
	});
	/** The code an authenticator app shows now, `drift` steps away. */
	const codeOf = (secret: string, drift = 0) =>
		codeAt(fromBase32(secret), stepAt(clock.now()) + drift);
	return { auth, store, clock, codeOf };
}

/** A user whose second factor is active, and the secret their app holds. */
export async function enrolled(context: ReturnType<typeof setup>) {
	const { auth, clock, codeOf } = context;
	const { user } = await auth.signUp({ ...ada, password });
	const { secret } = await auth.secondFactor.enroll(user);
	await auth.secondFactor.activate(user, codeOf(secret));
	// The activation used this step's code: the next one is a new step.
	clock.advance(30_000);
	return { user, secret };
}

/** Signs in, and answers the challenge `signIn` must have asked for. */
export async function challenged(auth: ReturnType<typeof setup>['auth']) {
	const result = await auth.signIn({ email: ada.email, password });
	if (result.status !== 'secondFactor') throw new Error('expected a challenge');
	return result.challenge;
}
