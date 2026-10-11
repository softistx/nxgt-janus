/**
 * `verifyEmail.proveFirst`'s shared setup, for the `prove-first.*.spec.ts`
 * beside this file: an instance whose listener records what it hears, and
 * the squatter it is made for — somebody who signed up with Ada's address
 * and a password of their own. No case lives here.
 */

import { ada, password } from '../../../test/auth';
import type { UserEvent } from '../events';
import { setup } from '../events.fixtures';

export function listening() {
	const received: UserEvent[] = [];
	const context = setup((event) => void received.push(event));
	const types = () => received.map((event) => event.type);
	return { ...context, received, types };
}

/** Somebody signs up with Ada's e-mail and a password of their own. */
export async function squatted(auth: ReturnType<typeof setup>['auth']) {
	return auth.signUp({ ...ada, password });
}
