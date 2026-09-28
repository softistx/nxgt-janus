/**
 * `janus()` with the sign-in throttle, and a hasher that counts what it
 * compares — for the `sign-in-attempts.*.spec.ts` beside this file.
 */

import { expect } from 'bun:test';
import { ada, hasher, password, person } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { fixedClock } from '../time/clock';
import type { SignInConfig } from './config';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import type { JanusStores } from './port/types';

/** Fifteen minutes: the default window. */
export const WINDOW_MS = 15 * 60_000;

export const THROTTLED =
	'signIn: too many passwords tried at this login — wait for the next window';

export function throttled(
	options: {
		readonly signIn?: SignInConfig;
		readonly store?: JanusStores;
	} = {},
) {
	// Midnight, so the clock sits at the start of a window.
	const clock = fixedClock(Date.UTC(2026, 8, 23));
	const store = options.store ?? createMemoryStores();
	const compared = { count: 0 };
	const counting = {
		...hasher,
		verify: async (plain: string, hash: string) => {
			compared.count += 1;
			return hasher.verify(plain, hash);
		},
	};
	const auth = janus({
		user: person,
		password: { login: 'email' },
		store,
		hasher: counting,
		clock,
		...(options.signIn === undefined ? {} : { signIn: options.signIn }),
	});
	return { auth, store, clock, compared };
}

export type Throttled = ReturnType<typeof throttled>;

/** Signs Ada up, and answers her. */
export async function signedUp({ auth }: Throttled) {
	return (await auth.signUp({ ...ada, password })).user;
}

/** Tries `count` wrong passwords at `email`, one after the other, and answers each reason. */
export async function guess(
	{ auth }: Throttled,
	count: number,
	email: string = ada.email,
): Promise<unknown[]> {
	const reasons: unknown[] = [];
	for (let at = 0; at < count; at += 1) {
		const error = await rejection(
			auth.signIn({ email, password: 'wrong password' }),
		);
		expect(error).toMatchObject({ code: 'CREDENTIALS_INVALID' });
		reasons.push((error as { reason?: unknown }).reason);
	}
	return reasons;
}
