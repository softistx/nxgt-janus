import type { ResolvedType } from '../config';
import { type Context, writeUser } from '../context';
import type { UserRecord } from '../port/types';
import { seal } from '../sealing';
import { mintTotpSecret, otpauthUri } from '../totp';
import type { SecondFactorEnrolment, UserRef, WriteOptions } from '../types';
import { isActive, requireSettings } from './factor';
import { refusal } from './refusal';

/** Writes a factor waiting for its first code, and answers the secret to show. */
export async function enrollFactor(
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
