import { SecondFactorError } from '../../errors/janus-error';
import type { At } from '../at';
import type { ResolvedType } from '../config';
import { type AnyUser, type Context, toUser, writeUser } from '../context';
import { emit } from '../events';
import { codeInvalid } from '../one-time';
import type { UserRecord } from '../port/types';
import { seal } from '../sealing';
import { mintTotpSecret, otpauthUri } from '../totp';
import type {
	SecondFactorApi,
	SecondFactorEnrolment,
	UserRef,
	WriteOptions,
} from '../types';
import { acceptCode, isActive, requireSettings } from './factor';

type Lifecycle = Pick<
	SecondFactorApi<AnyUser>['secondFactor'],
	'enroll' | 'activate' | 'disable'
>;

/** Enrolling, activating and disabling a factor: each one write under a version. */
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

/** Writes a factor waiting for its first code, and answers the secret to show. */
async function enrollFactor(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	options: WriteOptions | undefined,
	where: string,
): Promise<SecondFactorEnrolment> {
	const configured = requireSettings(
		context,
		where,
		'a second factor is being enrolled',
	);
	const secret = mintTotpSecret();

	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		(record) => {
			if (isActive(record.secondFactor)) {
				throw refusal(
					type,
					'SECOND_FACTOR_ACTIVE',
					"the user's second factor is active — disable it first",
					where,
					record,
				);
			}
			accountOf(type, record, where);
			return {
				secondFactor: {
					method: 'totp',
					secret: seal(configured.sealer, secret, record.id),
					confirmedAt: null,
					lastStep: null,
				},
			};
		},
	);

	return {
		secret,
		uri: otpauthUri(configured.issuer, accountOf(type, written, where), secret),
	};
}

/** Confirms a waiting factor with its first code: from then on, it is asked for. */
async function activateFactor(
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

/**
 * Removes the factor, active or waiting. Reported only when an active one
 * went: a user who had none, or whose factor never received its first code,
 * was never asked for one, and still is not.
 */
async function disableFactor(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	options: WriteOptions | undefined,
	where: string,
): Promise<AnyUser> {
	let wasActive = false;
	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		(record) => {
			wasActive = isActive(record.secondFactor);
			return { secondFactor: null };
		},
	);
	if (wasActive) {
		await emit(
			context,
			'user.secondFactorDisabled',
			written,
			written.updatedAt,
		);
	}
	return toUser(written);
}

/** The login a user signs in with: the account name the app shows. */
function accountOf(
	type: ResolvedType,
	record: UserRecord,
	where: string,
): string {
	if (type.password === null) {
		throw new TypeError(
			`${where}: the ${type.name} type does not sign in with a password, so it has no second factor`,
		);
	}
	return String(record.fields[type.password.login]);
}

/** The refusal of a lifecycle step, naming the user and its type. */
const refusal = (
	type: ResolvedType,
	code: 'SECOND_FACTOR_NOT_ENROLLED' | 'SECOND_FACTOR_ACTIVE',
	message: string,
	where: string,
	record: UserRecord,
) =>
	new SecondFactorError(code, `${where}: ${message}`, {
		operation: where,
		userId: record.id,
		userType: type.name,
	});
