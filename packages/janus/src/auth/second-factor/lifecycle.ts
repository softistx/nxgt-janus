import type { At } from '../at';
import type { ResolvedType } from '../config';
import type { AnyUser, Context } from '../context';
import type { SecondFactorApi } from '../types';
import { activateFactor } from './activate';
import { disableFactor } from './disable';
import { enrollFactor } from './enroll';
import { regenerateRecoveryCodes } from './regenerate';

type Lifecycle = Pick<
	SecondFactorApi<AnyUser>['secondFactor'],
	'enroll' | 'activate' | 'regenerateRecoveryCodes' | 'disable'
>;

/**
 * Enrolling, activating, regenerating its recovery codes and disabling a
 * factor: each one write under a version. This module only names each call;
 * each step is a module of its own — `./enroll`, `./activate`,
 * `./regenerate`, `./disable`.
 */
export function lifecycleFlows(
	context: Context,
	type: ResolvedType,
	at: At,
): Lifecycle {
	return {
		async enroll(user, options) {
			return enrollFactor(
				context,
				type,
				user,
				options,
				at('secondFactor.enroll'),
			);
		},

		async activate(user, code, options) {
			return activateFactor(
				context,
				type,
				user,
				code,
				options,
				at('secondFactor.activate'),
			);
		},

		async regenerateRecoveryCodes(user, code, options) {
			return regenerateRecoveryCodes(
				context,
				type,
				user,
				code,
				options,
				at('secondFactor.regenerateRecoveryCodes'),
			);
		},

		async disable(user, options) {
			return disableFactor(
				context,
				type,
				user,
				options,
				at('secondFactor.disable'),
			);
		},
	};
}
