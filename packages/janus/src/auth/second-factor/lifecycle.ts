import { SecondFactorError } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import { type AnyUser, type Context, toUser, writeUser } from '../context';
import type { UserRecord } from '../port/types';
import { seal } from '../sealing';
import { mintTotpSecret, otpauthUri } from '../totp';
import type { SecondFactorApi } from '../types';
import { acceptCode, codeInvalid, isActive, requireSettings } from './factor';

type Lifecycle = Pick<
	SecondFactorApi<AnyUser>['secondFactor'],
	'enroll' | 'activate' | 'disable'
>;

/** Enrolling, activating and disabling a factor: each one write under a version. */
export function lifecycleFlows(
	context: Context,
	type: ResolvedType,
	at: (operation: string) => string,
): Lifecycle {
	/** The login a user signs in with: the account name the app shows. */
	const accountOf = (record: UserRecord, where: string): string => {
		if (type.password === null) {
			throw new TypeError(
				`${where}: the ${type.name} type does not sign in with a password, so it has no second factor`,
			);
		}
		return String(record.fields[type.password.login]);
	};

	const refuse = (
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

	return {
		async enroll(user, options) {
			const where = at('secondFactor.enroll');
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
						throw refuse(
							'SECOND_FACTOR_ACTIVE',
							"the user's second factor is active — disable it first",
							where,
							record,
						);
					}
					accountOf(record, where);
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
				uri: otpauthUri(configured.issuer, accountOf(written, where), secret),
			};
		},

		async activate(user, code, options) {
			const where = at('secondFactor.activate');
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
						throw refuse(
							'SECOND_FACTOR_NOT_ENROLLED',
							'the user has no second factor waiting — call enroll first',
							where,
							record,
						);
					}
					if (isActive(factor)) {
						throw refuse(
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
					if (accepted === null) throw codeInvalid(type, where, record.id);
					return { secondFactor: { ...accepted, confirmedAt: now } };
				},
			);
			return toUser(written);
		},

		async disable(user, options) {
			const where = at('secondFactor.disable');
			return toUser(
				await writeUser(context, user, type, options, where, () => ({
					secondFactor: null,
				})),
			);
		},
	};
}
