/** A user as the core answers one, from the record a store holds. */

import type { UserRecord } from '../port/types';
import type { User, UserRef } from '../types';

/** A user of any type, as the degenericised core handles them. */
export type AnyUser = User<string, Record<string, unknown>>;

/**
 * A user as application code sees it: their fields at the top level, then
 * what `janus` sets — written last, so no stored key can shadow it. No password
 * hash, ever.
 */
export function toUser(record: UserRecord): AnyUser {
	return {
		...record.fields,
		id: record.id,
		type: record.type,
		emailVerified: record.emailVerifiedAt !== null,
		active: record.active,
		hasPassword: record.password !== null,
		hasSecondFactor: record.secondFactor?.confirmedAt != null,
		version: record.version,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

/** The id a {@link UserRef} names. */
export const idOf = (user: UserRef): string =>
	typeof user === 'string' ? user : user.id;
