/**
 * `janus()` with the three kinds of user type `findByEmail` meets — signing
 * in by e-mail, by a username beside an e-mail, and with no password at all
 * — for the `find-by-email.*.spec.ts` beside this file.
 */

import { z } from 'zod';
import { hasher } from '../../../test/auth';
import { fixedClock } from '../../time/clock';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

export const Member = z.strictObject({ email: z.email(), name: z.string() });
export const Staff = z.strictObject({
	username: z.string(),
	email: z.email(),
});

export function lookup(options: { readonly store?: JanusStores } = {}) {
	const store = options.store ?? createMemoryStores();
	const auth = janus({
		users: {
			patient: { schema: Member, password: { login: 'email' } },
			staff: {
				schema: Staff,
				password: { login: 'username', normalize: 'none' },
			},
			member: { schema: Member },
		},
		store,
		hasher,
		clock: fixedClock(Date.UTC(2026, 8, 23)),
	});
	return { auth, store };
}
