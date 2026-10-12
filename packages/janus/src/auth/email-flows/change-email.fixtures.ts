/**
 * `changeEmail`'s shared setup, for the `change-email.*.spec.ts` beside this
 * file: an instance whose listener records what it hears, Ada signed up and
 * verified, and a second user holding another address. No case lives here.
 */

import { ada, hasher, password, person } from '../../../test/auth';
import { fixedClock } from '../../time/clock';
import type { UserEvent } from '../events';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

export const NEW_EMAIL = 'countess@example.test';
export const HOUR = 3_600_000;

export function changing(store: JanusStores = createMemoryStores()) {
	const received: UserEvent[] = [];
	const clock = fixedClock(Date.UTC(2026, 8, 26));
	const auth = janus({
		user: person,
		password: { login: 'email' },
		store,
		hasher,
		clock,
		events: (event) => void received.push(event),
	});
	const types = () => received.map((event) => event.type);
	return { auth, store, clock, received, types };
}

export type Changing = ReturnType<typeof changing>;

/** Ada, signed up with a password and her e-mail verified. */
export async function verifiedAda({ auth }: Changing) {
	const { user } = await auth.signUp({ ...ada, password });
	const sent = await auth.verifyEmail.send(user);
	return auth.verifyEmail.confirm(sent.token);
}
