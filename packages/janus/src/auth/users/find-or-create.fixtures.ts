/**
 * `janus()` with the kinds of user type `findOrCreate` meets — a password
 * and the e-mail as login, a username beside an e-mail, and no password at
 * all — and a store that loses a race, for the `find-or-create*.spec.ts`
 * beside this file.
 */

import { z } from 'zod';
import { hasher } from '../../../test/auth';
import { StoreConflict } from '../../errors/janus-error';
import { mintId } from '../../ids/id';
import { fixedClock } from '../../time/clock';
import type { UserEvent } from '../events';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores, UserRecord } from '../port/types';

const Member = z.strictObject({ email: z.email(), name: z.string() });
const Staff = z.strictObject({ username: z.string(), email: z.email() });

export function invitations(options: { readonly store?: JanusStores } = {}) {
	const store = options.store ?? createMemoryStores();
	const received: UserEvent[] = [];
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
		events: (event) => {
			received.push(event);
		},
	});
	return { auth, store, received };
}

/**
 * The reference stores whose first `insertUser` loses a race: a competing
 * record is written first, then the write is refused as `LOGIN_TAKEN`.
 * `writes` counts the `insertUser` calls that reached the store.
 */
export function losingARace(
	competitor: (attempted: UserRecord) => UserRecord = (attempted) => attempted,
) {
	const memory = createMemoryStores();
	const writes = { count: 0 };
	let lost = false;
	const store: JanusStores = {
		...memory,
		users: {
			...memory.users,
			async insertUser(record) {
				writes.count += 1;
				if (!lost) {
					lost = true;
					await memory.users.insertUser({
						...competitor(record),
						id: mintId(record.createdAt.getTime()),
					});
					throw new StoreConflict('login', 'a login is taken');
				}
				return memory.users.insertUser(record);
			},
		},
	};
	return { store, writes };
}

/** The reference stores counting the `insertUser` calls that reach them. */
export function countingWrites() {
	const memory = createMemoryStores();
	const writes = { count: 0 };
	const store: JanusStores = {
		...memory,
		users: {
			...memory.users,
			async insertUser(record) {
				writes.count += 1;
				return memory.users.insertUser(record);
			},
		},
	};
	return { store, writes };
}
