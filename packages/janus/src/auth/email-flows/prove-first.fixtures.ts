/**
 * `verifyEmail.proveFirst`'s shared setup, for the `prove-first.*.spec.ts` and `verify-email.first-proof.spec.ts`
 * beside this file: an instance whose listener records what it hears, and
 * the squatter it is made for — somebody who signed up with Ada's address
 * and a password of their own. No case lives here.
 */

import { ada, hasher, password, person } from '../../../test/auth';
import { fixedClock } from '../../time/clock';
import type { UserEvent } from '../events';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';

export function listening() {
	const received: UserEvent[] = [];
	const auth = janus({
		user: person,
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher,
		clock: fixedClock(Date.UTC(2026, 8, 26)),
		events: (event) => void received.push(event),
	});
	const types = () => received.map((event) => event.type);
	return { auth, received, types };
}

/** Somebody signs up with Ada's e-mail and a password of their own. */
export async function squatted(auth: ReturnType<typeof listening>['auth']) {
	return auth.signUp({ ...ada, password });
}
