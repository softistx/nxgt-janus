import type { ConformanceCase } from '../../types';
import { sessionDeletionCases } from './deletion';
import { sessionExtensionCases } from './extension';
import { sessionInsertCases } from './inserts';
import { sessionReadCases } from './reads';
import { sessionReauthenticationCases } from './reauthentication';
import { sessionRevocationCases } from './revocation';

/** Every case of the session store, in the order they are described. */
export const sessionStoreCases: readonly ConformanceCase[] = [
	...sessionReadCases,
	...sessionInsertCases,
	...sessionExtensionCases,
	...sessionReauthenticationCases,
	...sessionRevocationCases,
	...sessionDeletionCases,
];
