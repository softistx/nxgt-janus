import type { RelationCase } from '../types';
import { relationDeletionCases } from './deletion';
import { relationReadCases } from './reads';
import { relationTraversalCases } from './traversal';
import { relationWriteCases } from './writes';

/** Every case of the relation store, outages aside, in the order they are described. */
export const relationStoreCases: readonly RelationCase[] = [
	...relationReadCases,
	...relationWriteCases,
	...relationTraversalCases,
	...relationDeletionCases,
];
