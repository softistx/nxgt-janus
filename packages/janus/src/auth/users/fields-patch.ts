import type { ResolvedType } from '../config';
import { normalizeEmail } from '../config';
import { emailOf, loginsOf, validateFields } from '../context';
import type { UserRecord } from '../port/types';
import type { Input } from './any-type-api';

/**
 * What `update` writes: the patch merged over the stored fields, the whole
 * result validated, and the logins derived again from it.
 */
export async function fieldsPatch(
	type: ResolvedType,
	record: UserRecord,
	patch: Input,
	where: string,
) {
	const fields = await validateFields(
		type,
		{ ...record.fields, ...patch },
		where,
	);
	const before = emailOf(type, record.fields);
	const after = emailOf(type, fields);
	const emailChanged =
		(before === null ? null : normalizeEmail(before)) !==
		(after === null ? null : normalizeEmail(after));

	return {
		fields,
		logins: loginsOf(type, fields, where),
		schemaVersion: type.schemaVersion,
		// A new e-mail is an unproven one.
		...(emailChanged ? { emailVerifiedAt: null } : {}),
	};
}
