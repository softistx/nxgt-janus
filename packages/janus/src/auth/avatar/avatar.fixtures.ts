/**
 * The avatar specs' shared setup: one type and several, each with a listener
 * that records what it hears. Specs only — no case lives here.
 */

import { z } from 'zod';
import { hasher, person } from '../../../test/auth';
import { fixedClock } from '../../time/clock';
import type { UserEvent } from '../events';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

export const ada = { email: 'ada@example.test', name: 'Ada' };

/** One user type, over `store` when it is given. */
export function single(store: JanusStores = createMemoryStores()) {
	const clock = fixedClock(Date.UTC(2026, 8, 26));
	const received: UserEvent[] = [];
	const auth = janus({
		user: person,
		store,
		hasher,
		clock,
		events: (event) => void received.push(event),
	});
	return { auth, clock, received, store };
}

/** Two types, so the root has an `avatar` of its own. */
export function several() {
	const clock = fixedClock(Date.UTC(2026, 8, 26));
	const received: UserEvent[] = [];
	const store = createMemoryStores();
	const auth = janus({
		users: {
			patient: { schema: person },
			staff: { schema: z.strictObject({ username: z.string() }) },
		},
		store,
		hasher,
		clock,
		events: (event) => void received.push(event),
	});
	return { auth, clock, received, store };
}

/** `store`, counting the reads of a user by id. */
export function countingReads(store: JanusStores) {
	const reads = { count: 0 };
	const counted: JanusStores = {
		...store,
		users: {
			...store.users,
			findUser: (id) => {
				reads.count += 1;
				return store.users.findUser(id);
			},
		},
	};
	return { counted, reads };
}
