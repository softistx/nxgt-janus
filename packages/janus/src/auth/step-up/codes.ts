/**
 * The two codes that confirm a step-up: the one e-mailed with the challenge,
 * and, for a user whose second factor is active, the one their app shows.
 * Each spends the challenge once it matched.
 */

import { SecondFactorError } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import type { Context } from '../context';
import {
	burnOneTime,
	codeInvalid,
	codeMatches,
	refuseStale,
	spendOneTime,
} from '../one-time';
import type { TokenRecord, UserRecord } from '../port/types';
import { countAppCodeAttempt } from '../second-factor/app-code-attempts';
import { acceptCode, isActive, requireSettings } from '../second-factor/factor';

/** A challenge counted: the token as counted, its secret, and what is left of its attempts. */
export interface CountedStepUp {
	readonly token: TokenRecord;
	readonly secret: string;
	readonly attemptsLeft: number;
}

const spend = (context: Context, secret: string, where: string) =>
	spendOneTime(context, secret, 'stepUp', where, 'challenge');

/**
 * Checks the e-mailed code. Refused when the user's second factor became
 * active since it was sent — their app is what confirms now — and when the
 * e-mail it was sent to is not theirs any more.
 */
export async function checkEmailedCode(
	context: Context,
	type: ResolvedType,
	user: UserRecord,
	counted: CountedStepUp,
	code: string,
	where: string,
): Promise<void> {
	const { token, secret, attemptsLeft } = counted;
	if (isActive(user.secondFactor)) {
		await spend(context, secret, where);
		throw new SecondFactorError(
			'SECOND_FACTOR_ACTIVE',
			`${where}: the user's second factor became active since the code was sent — request a step-up again`,
			{ operation: where, userId: user.id, userType: type.name },
		);
	}
	if (!codeMatches(token, secret, code)) {
		if (attemptsLeft === 0) await burnOneTime(context, secret, 'stepUp');
		throw codeInvalid(where, user.id, type.name, attemptsLeft);
	}
	await spend(context, secret, where);
	refuseStale(type, user, token, where, 'code');
}

/**
 * Checks a code from the user's app. Its attempts are counted twice before it
 * is compared: against the challenge, and per user and window, as
 * `regenerateRecoveryCodes`' are — a stolen session asking for challenge
 * after challenge still gets five guesses per window, not five per
 * challenge. The code accepted is written, so it confirms nothing else.
 */
export async function checkAppCode(
	context: Context,
	type: ResolvedType,
	user: UserRecord,
	counted: CountedStepUp,
	code: string,
	where: string,
): Promise<void> {
	const { secret, attemptsLeft } = counted;
	const factor = user.secondFactor;
	if (!isActive(factor)) {
		await spend(context, secret, where);
		throw new SecondFactorError(
			'SECOND_FACTOR_NOT_ENROLLED',
			`${where}: the user no longer has a second factor — request a step-up again`,
			{ operation: where, userId: user.id, userType: type.name },
		);
	}
	const configured = requireSettings(
		context,
		where,
		"the user's second factor is active",
	);
	const windowLeft = await countAppCodeAttempt(
		context,
		configured.sealer,
		user,
		where,
	);

	const now = context.clock.now();
	const accepted = acceptCode(configured, user, factor, code, now, where);
	if (accepted === null) {
		if (attemptsLeft === 0) await burnOneTime(context, secret, 'stepUp');
		throw codeInvalid(
			where,
			user.id,
			type.name,
			Math.min(attemptsLeft, windowLeft),
		);
	}
	// Written under the version read: of two codes accepted at once, the
	// second write is VERSION_CONFLICT.
	await context.store.users.updateUser(
		user.id,
		{ secondFactor: accepted, updatedAt: now },
		user.version,
	);
	await spend(context, secret, where);
}
