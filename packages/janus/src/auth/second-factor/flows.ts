import type { ResolvedType } from '../config';
import type { AnyUser, Context } from '../context';
import type { UserRecord } from '../port/types';
import type { SecondFactorApi } from '../types';
import { challengeFlows } from './challenge';
import { isActive } from './factor';
import { lifecycleFlows } from './lifecycle';

/**
 * The second factor of one user type: the flows its API answers, and what
 * `signIn` needs — whether to ask for a code, and the challenge to answer.
 */
export function secondFactorFlows(
	context: Context,
	type: ResolvedType,
	at: (operation: string) => string,
) {
	const challenges = challengeFlows(context, type, at);
	const api: SecondFactorApi<AnyUser>['secondFactor'] = {
		...lifecycleFlows(context, type, at),
		confirm: challenges.confirm,
	};

	return {
		api,
		challenge: challenges.issue,
		/** Whether `signIn` must ask for a code before opening a session. */
		required: (record: UserRecord): boolean => isActive(record.secondFactor),
	};
}
