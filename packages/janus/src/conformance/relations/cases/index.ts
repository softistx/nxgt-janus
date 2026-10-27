import type { RelationCase } from '../types';
import { relationDeletionCases } from './deletion';
import { relationHolderCases } from './holders';
import { relationReadCases } from './reads';
import { relationTraversalCases } from './traversal';
import { relationWriteCases } from './writes';

/** Every case of the relation store, outages aside, in the order they are described. */
export const relationStoreCases: readonly RelationCase[] = [
	...relationReadCases,
	...relationHolderCases,
	...relationWriteCases,
	...relationTraversalCases,
	...relationDeletionCases,
];
