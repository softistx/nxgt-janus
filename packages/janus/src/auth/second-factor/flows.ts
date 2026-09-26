import type { ResolvedType } from '../config';
import type { AnyUser, Context } from '../context';
import type { UserRecord } from '../port/types';
import { openSession } from '../sessions';
import type { SecondFactorApi, SignInResult } from '../types';
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
		/**
		 * What a sign-in answers once the user proved who they are — by
		 * password or by an e-mail code: a session, or a challenge when their
		 * second factor is active. The first factor alone opens nothing then.
		 */
		finish: (
			record: UserRecord,
			where: string,
		): Promise<SignInResult<AnyUser>> =>
			isActive(record.secondFactor)
				? challenges.issue(record, where)
				: openSession(context, type, record),
	};
}
