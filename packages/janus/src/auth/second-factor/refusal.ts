import { SecondFactorError } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import type { UserRecord } from '../port/types';

/** The refusal of a lifecycle step, naming the user and its type. */
export const refusal = (
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
