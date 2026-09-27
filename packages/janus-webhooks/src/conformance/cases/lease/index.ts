import type { WebhookQueueCase } from '../../types';
import { leaseConcurrencyCases } from './concurrency';
import { leaseExpiryCases } from './expiry';
import { leaseHoldingCases } from './holding';
import { leaseReinsertCases } from './reinserts';
import { leaseSettlingCases } from './settling';

/**
 * What hides a claimed delivery, what gives it back, and what it keeps:
 * every lease case, in the order they are described.
 */
export const leaseCases: readonly WebhookQueueCase[] = [
	...leaseExpiryCases,
	...leaseReinsertCases,
	...leaseHoldingCases,
	...leaseSettlingCases,
	...leaseConcurrencyCases,
];
