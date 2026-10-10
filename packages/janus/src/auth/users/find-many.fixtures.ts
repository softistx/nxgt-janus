/**
 * A users store that counts what `findMany` asks of it: the `findUsers` calls
 * and their sizes, the `findUser` calls, and how many of those ran at once.
 * With `batch: false`, the store has no `findUsers`, as a third-party adapter
 * that predates it.
 */

import { createMemoryStores } from '../port/memory';
import type { JanusStores, UserStore } from '../port/types';

export interface Calls {
	readonly batches: number[];
	/** Set it, and every `findUser` and `findUsers` fails as a driver would. */
	failing: boolean;
	findUser: number;
	inFlight: number;
	mostInFlight: number;
}

export function countingStores(options: { batch: boolean }): {
	store: JanusStores;
	calls: Calls;
} {
	const memory = createMemoryStores();
	const calls: Calls = {
		batches: [],
		failing: false,
		findUser: 0,
		inFlight: 0,
		mostInFlight: 0,
	};
	const { findUsers, ...required } = memory.users;

	const users: UserStore = {
		...required,
		async findUser(id) {
			calls.findUser += 1;
			calls.inFlight += 1;
			calls.mostInFlight = Math.max(calls.mostInFlight, calls.inFlight);
			// A turn of the event loop, so calls started together overlap.
			await new Promise((resolve) => setTimeout(resolve, 1));
			calls.inFlight -= 1;
			if (calls.failing) throw new Error('connection refused');
			return required.findUser(id);
		},
	};
	if (options.batch && findUsers !== undefined) {
		users.findUsers = async (ids) => {
			calls.batches.push(ids.length);
			if (calls.failing) throw new Error('connection refused');
			return findUsers.call(memory.users, ids);
		};
	}

	return { store: { ...memory, users }, calls };
}
