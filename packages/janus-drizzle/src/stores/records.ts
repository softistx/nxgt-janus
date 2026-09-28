import type { Id, SessionRecord, UserPatch, UserRecord } from '@nxgt/janus';
import { type SQL, sql } from 'drizzle-orm';
import type { JanusTables } from '../tables';

// ─── Rows and records ─────────────────────────────────────────────────────
//
// Each record is rebuilt field by field: the port's records are exactly what
// it declares, and a row carries columns the record names differently.

type UserRow = JanusTables['users']['$inferSelect'];
type UserInsert = JanusTables['users']['$inferInsert'];
type SessionRow = JanusTables['sessions']['$inferSelect'];

export function toUserRow(record: UserRecord): UserInsert {
	return {
		id: record.id,
		type: record.type,
		schemaVersion: record.schemaVersion,
		active: record.active,
		fields: record.fields,
		logins: [...record.logins],
		passwordHash: record.password?.hash ?? null,
		passwordUpdatedAt: record.password?.updatedAt ?? null,
		...toSecondFactorColumns(record.secondFactor),
		emailVerifiedAt: record.emailVerifiedAt,
		version: record.version,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

/**
 * The columns a patch names. A key present with `undefined` is absent, as the
 * port says — never an erasure. `password: null` is named, and removes the
 * password.
 */
export function toUserSet(patch: UserPatch): Partial<UserInsert> {
	const set: Partial<UserInsert> = {
		updatedAt: patch.updatedAt,
	};
	if (patch.schemaVersion !== undefined)
		set.schemaVersion = patch.schemaVersion;
	if (patch.active !== undefined) set.active = patch.active;
	if (patch.fields !== undefined) set.fields = patch.fields;
	if (patch.logins !== undefined) set.logins = [...patch.logins];
	if (patch.emailVerifiedAt !== undefined)
		set.emailVerifiedAt = patch.emailVerifiedAt;
	if (patch.password !== undefined) {
		set.passwordHash = patch.password?.hash ?? null;
		set.passwordUpdatedAt = patch.password?.updatedAt ?? null;
	}
	if (patch.secondFactor !== undefined) {
		Object.assign(set, toSecondFactorColumns(patch.secondFactor));
	}
	return set;
}

/**
 * A second factor as its five columns, all `null` for none. No recovery
 * codes are written `null` too, never `{}`, and read back as `[]`: a row
 * then holds a code array only while it holds codes, so an instance of 0.3
 * — which knows four columns — can still remove a factor that has none.
 */
function toSecondFactorColumns(secondFactor: UserRecord['secondFactor']) {
	const codes = secondFactor?.recoveryCodes ?? [];
	return {
		secondFactorMethod: secondFactor?.method ?? null,
		secondFactorSecret: secondFactor?.secret ?? null,
		secondFactorConfirmedAt: secondFactor?.confirmedAt ?? null,
		secondFactorLastStep: secondFactor?.lastStep ?? null,
		secondFactorRecoveryCodes: codes.length === 0 ? null : [...codes],
	};
}

export function toUser(row: UserRow): UserRecord {
	return {
		id: row.id as Id,
		type: row.type,
		schemaVersion: row.schemaVersion,
		active: row.active,
		fields: row.fields as UserRecord['fields'],
		logins: [...row.logins],
		password:
			row.passwordHash === null || row.passwordUpdatedAt === null
				? null
				: { hash: row.passwordHash, updatedAt: row.passwordUpdatedAt },
		secondFactor:
			row.secondFactorMethod === null || row.secondFactorSecret === null
				? null
				: {
						method: row.secondFactorMethod,
						secret: row.secondFactorSecret,
						confirmedAt: row.secondFactorConfirmedAt,
						lastStep: row.secondFactorLastStep,
						recoveryCodes: [...(row.secondFactorRecoveryCodes ?? [])],
					},
		emailVerifiedAt: row.emailVerifiedAt,
		version: row.version,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function toSession(row: SessionRow): SessionRecord {
	return {
		id: row.id,
		tokenHash: row.tokenHash,
		userId: row.userId as Id,
		authenticatedAt: row.authenticatedAt,
		expiresAt: row.expiresAt,
		revokedAt: row.revokedAt,
		createdAt: row.createdAt,
	};
}

/**
 * A `Date` inside a `sql` template, as every driver takes it: `timestamptz`
 * from its ISO string. Drizzle's column mapping does not reach a raw
 * template, and postgres.js refuses a `Date` object there.
 */
export function stamp(at: Date): SQL {
	return sql`${at.toISOString()}::timestamptz`;
}
