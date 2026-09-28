import { normalizeEmail, type ResolvedType } from '../config';
import { emailOf, loginsOf, validateFields } from '../context';
import type { JsonObject, UserRecord } from '../port/types';
import type { Input } from './flow-types';

const normalized = (email: string | null) =>
	email === null ? null : normalizeEmail(email);

/**
 * Whether the e-mail differs between two sets of fields, compared normalised:
 * `Ada@Example.com` for `ada@example.com` is no change. The one test behind
 * both the new e-mail's verification reset and `user.emailChanged`.
 */
export function emailChanged(
	type: ResolvedType,
	before: JsonObject,
	after: JsonObject,
): boolean {
	return normalized(emailOf(type, before)) !== normalized(emailOf(type, after));
}

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

	return {
		fields,
		logins: loginsOf(type, fields, where),
		schemaVersion: type.schemaVersion,
		// A new e-mail is an unproven one.
		...(emailChanged(type, record.fields, fields)
			? { emailVerifiedAt: null }
			: {}),
	};
}
