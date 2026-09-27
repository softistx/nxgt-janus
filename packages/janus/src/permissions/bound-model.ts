/** What `permissions()` binds once, and every call of its answer reads. */

import type { RelationStore } from './port/types';
import type { ResolvedModel } from './resolve/resolved';

/** The resolved model, the guarded store, and how many relations a walk may cross. */
export interface BoundModel {
	readonly model: ResolvedModel;
	readonly store: RelationStore;
	readonly maxDepth: number;
}
