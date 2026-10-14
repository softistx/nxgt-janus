import { setup } from './engine.fixtures';
import { createMemoryRelations } from './port/memory';
import type { RelationChanges, RelationStore } from './port/types';

/** A memory store that keeps the changes each `write` was asked for. */
export function counting() {
	const inner = createMemoryRelations();
	const writes: RelationChanges[] = [];
	const store: RelationStore = {
		...inner,
		write: async (changes) => {
			writes.push(changes);
			await inner.write(changes);
		},
	};
	return { store, writes, access: setup(store) };
}
