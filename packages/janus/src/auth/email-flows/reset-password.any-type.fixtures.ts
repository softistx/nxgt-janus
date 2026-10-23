import { z } from 'zod';
import { hasher } from '../../../test/auth';
import { fixedClock } from '../../time/clock';
import type { UserEvent } from '../events';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';

export const Account = z.strictObject({ email: z.email(), name: z.string() });

/**
 * Two types that can reset a password — admins accept 8 characters, members
 * 12 — a type with an e-mail and no password, and a listener.
 */
export function threeTypes() {
	const received: UserEvent[] = [];
	const store = createMemoryStores();
	const clock = fixedClock(Date.UTC(2026, 8, 26));
	const auth = janus({
		users: {
			admin: { schema: Account, password: { login: 'email' } },
			member: { schema: Account, password: { login: 'email', minLength: 12 } },
			guest: { schema: z.strictObject({ email: z.email() }) },
		},
		store,
		hasher,
		clock,
		events: (event) => void received.push(event),
	});
	return { auth, store, clock, received };
}

export const ADMIN = { email: 'admin@example.test', name: 'Ada' };
export const MEMBER = { email: 'member@example.test', name: 'Max' };
export const OLD = 'old password';
export const LONG_OLD = 'old password of a member';
export const FRESH = 'a brand new password';
export const EIGHT = 'eight!!!';
export const TEN = 'ten chars!';
export const HOUR = 3_600_000;
