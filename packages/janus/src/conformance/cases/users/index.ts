import type { ConformanceCase } from '../../types';
import { userBatchCases } from './batch';
import { userDeletionCases } from './deletion';
import { userInsertCases } from './inserts';
import { userListingCases } from './listing';
import { userPatchCases } from './patches';
import { userReadCases } from './reads';
import { userVersionCases } from './versions';

/** Every case of the user store, in the order they are described. */
export const userStoreCases: readonly ConformanceCase[] = [
	...userReadCases,
	...userBatchCases,
	...userInsertCases,
	...userVersionCases,
	...userPatchCases,
	...userListingCases,
	...userDeletionCases,
];
