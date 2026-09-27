import type { ConformanceCase } from '../../types';
import { tokenAttemptCases } from './attempts';
import { tokenDeletionCases } from './deletion';
import { tokenInsertCases } from './inserts';
import { tokenRedemptionCases } from './redemption';
import { tokenSpendingCases } from './spending';

/** Every case of the token store, in the order they are described. */
export const tokenStoreCases: readonly ConformanceCase[] = [
	...tokenRedemptionCases,
	...tokenAttemptCases,
	...tokenSpendingCases,
	...tokenInsertCases,
	...tokenDeletionCases,
];
