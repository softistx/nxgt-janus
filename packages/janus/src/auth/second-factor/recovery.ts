import type { At } from '../at';
import type { ResolvedType } from '../config';
import type { AnyUser, Context } from '../context';
import { emit } from '../events';
import { openSession } from '../sessions';
import type { RecoveredSignIn } from '../types';
import { findRecoveryCode } from './recovery-codes';
import { openChallenge, refuseCode, spendChallenge } from './redeem';

/**
 * Redeems `signIn`'s challenge with a recovery code instead of an app's
 * code: for a user whose phone is gone.
 *
 * The challenge is counted and its user checked exactly as for `confirm`.
 * A code that matches is **removed** — its hash dropped from the factor — in
 * one write under the version read, as `confirm` writes its last step: of
 * two sign-ins spending the same code at once, the second write is
 * `VERSION_CONFLICT`, and that sign-in opens nothing.
 */
export async function recoverWithCode(
	context: Context,
	type: ResolvedType,
	challenge: string,
	code: string,
	at: At,
): Promise<RecoveredSignIn<AnyUser>> {
	const where = at('secondFactor.recover');
	const opened = await openChallenge(context, type, challenge, where);
	const { record } = opened;
	const factor = record.secondFactor;

	const found = findRecoveryCode(
		opened.configured.sealer,
		record.id,
		factor.recoveryCodes,
		String(code),
		where,
	);
	if (found === -1) return refuseCode(context, type, opened, where);

	const recoveryCodes = factor.recoveryCodes.filter(
		(_, index) => index !== found,
	);
	const written = await context.store.users.updateUser(
		record.id,
		{
			secondFactor: { ...factor, recoveryCodes },
			updatedAt: context.clock.now(),
		},
		record.version,
	);
	// The code is spent once written, whatever follows: the event reports it
	// even when spending the challenge or opening the session fails.
	try {
		await spendChallenge(context, opened.secret, where);
		const signedIn = await openSession(context, type, written);
		return { ...signedIn, recoveryCodesLeft: recoveryCodes.length };
	} finally {
		await emit(context, 'user.recoveryCodeUsed', written, written.updatedAt);
	}
}
