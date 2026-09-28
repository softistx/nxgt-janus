import type { ResolvedType } from '../config';
import { type AnyUser, type Context, toUser, writeUser } from '../context';
import { emit } from '../events';
import { codeInvalid } from '../one-time';
import type { RecoveryCodesIssued, UserRef, WriteOptions } from '../types';
import { acceptCode, isActive, requireSettings } from './factor';
import { hashRecoveryCode, mintRecoveryCodes } from './recovery-codes';
import { refusal } from './refusal';

/**
 * Replaces a user's recovery codes with new ones, and answers them once: the
 * old ones, used or not, stop working. Takes a **fresh code from the app** —
 * whoever holds a session alone cannot mint codes that outlive it — and
 * spends it, as a code accepted anywhere else is spent.
 */
export async function regenerateRecoveryCodes(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	code: string,
	options: WriteOptions | undefined,
	where: string,
): Promise<RecoveryCodesIssued<AnyUser>> {
	const configured = requireSettings(
		context,
		where,
		'recovery codes are being regenerated',
	);
	const recoveryCodes = mintRecoveryCodes();

	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		(record, now) => {
			const factor = record.secondFactor;
			if (!isActive(factor)) {
				throw refusal(
					type,
					'SECOND_FACTOR_NOT_ENROLLED',
					'the user has no active second factor — recovery codes come with one',
					where,
					record,
				);
			}
			const accepted = acceptCode(
				configured,
				record,
				factor,
				String(code),
				now,
				where,
			);
			if (accepted === null) throw codeInvalid(where, record.id, type.name);
			return {
				secondFactor: {
					...accepted,
					recoveryCodes: recoveryCodes.map((one) =>
						hashRecoveryCode(configured.sealer, record.id, one),
					),
				},
			};
		},
	);
	await emit(
		context,
		'user.recoveryCodesRegenerated',
		written,
		written.updatedAt,
	);
	return { user: toUser(written), recoveryCodes };
}
