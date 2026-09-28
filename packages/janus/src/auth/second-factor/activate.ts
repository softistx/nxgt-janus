import type { ResolvedType } from '../config';
import { type AnyUser, type Context, toUser, writeUser } from '../context';
import { emit } from '../events';
import { codeInvalid } from '../one-time';
import type { UserRef, WriteOptions } from '../types';
import { acceptCode, isActive, requireSettings } from './factor';
import { refusal } from './refusal';

/** Confirms a waiting factor with its first code: from then on, it is asked for. */
export async function activateFactor(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	code: string,
	options: WriteOptions | undefined,
	where: string,
): Promise<AnyUser> {
	const configured = requireSettings(
		context,
		where,
		'a second factor is being activated',
	);

	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		(record, now) => {
			const factor = record.secondFactor;
			if (factor === null) {
				throw refusal(
					type,
					'SECOND_FACTOR_NOT_ENROLLED',
					'the user has no second factor waiting — call enroll first',
					where,
					record,
				);
			}
			if (isActive(factor)) {
				throw refusal(
					type,
					'SECOND_FACTOR_ACTIVE',
					"the user's second factor is already active",
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
			return { secondFactor: { ...accepted, confirmedAt: now } };
		},
	);
	// After the write, the flow's last step: the factor is asked for from now.
	await emit(context, 'user.secondFactorEnabled', written, written.updatedAt);
	return toUser(written);
}
