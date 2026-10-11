import type { ResolvedType } from '../config';
import { type AnyUser, type Context, holderOfEmail, toUser } from '../context';
import type { FindByEmailApi } from '../types';

/**
 * `findByEmail` for one user type: the holder the e-mail flows would find —
 * the same normalisation, the same comparison with the stored address — with
 * nothing counted, issued or written. A value that is no address is
 * nobody's, as a malformed id is for `find`, and the store is not asked.
 */
export function findByEmailFlows(
	context: Context,
	type: ResolvedType,
): FindByEmailApi<AnyUser> {
	return {
		async findByEmail(email) {
			// From JavaScript, or a value a request carried: nobody's, never a throw.
			if (typeof email !== 'string' || email.trim() === '') return null;
			const record = await holderOfEmail(context, type, email);
			return record === null ? null : toUser(record);
		},
	};
}
