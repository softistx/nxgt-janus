import type {
	Id,
	SessionRecord,
	TokenRecord,
	UserPatch,
	UserRecord,
} from '@nxgt/janus';
import type { DocumentOf } from '@nxgt/mongo';
import type { sessions, tokens, users } from '../collections';

// ─── Documents and records ────────────────────────────────────────────────
//
// Each record is rebuilt field by field, never spread from a document: a
// spread would hand the core `_id` and the `id` getter `@nxgt/mongo` adds,
// and the port's records are exactly what it declares.

type UserDocument = DocumentOf<typeof users>;
type SessionDocument = DocumentOf<typeof sessions>;
type TokenDocument = DocumentOf<typeof tokens>;

export function toUserDocument(record: UserRecord): UserDocument {
	return structuredClone({
		_id: record.id,
		type: record.type,
		schemaVersion: record.schemaVersion,
		active: record.active,
		fields: record.fields,
		logins: [...record.logins],
		password: record.password,
		secondFactor: record.secondFactor,
		emailVerifiedAt: record.emailVerifiedAt,
		version: record.version,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	});
}

/**
 * The fields a patch names, as one `$set`. A key present with `undefined` is
 * absent, as the port says — never an erasure. `password: null` is named, and
 * removes the password.
 */
export function toUserSet(patch: UserPatch): Record<string, unknown> {
	const set: Record<string, unknown> = { updatedAt: patch.updatedAt };

	for (const field of [
		'schemaVersion',
		'active',
		'fields',
		'logins',
		'password',
		'secondFactor',
		'emailVerifiedAt',
	] as const) {
		if (patch[field] !== undefined) set[field] = patch[field];
	}

	return structuredClone(set);
}

export function toUser(document: UserDocument): UserRecord {
	const password = document.password;
	const secondFactor = document.secondFactor ?? null;
	return {
		id: document._id as Id,
		type: document.type,
		schemaVersion: document.schemaVersion,
		active: document.active,
		fields: document.fields as UserRecord['fields'],
		logins: [...document.logins],
		password:
			password === null
				? null
				: { hash: password.hash, updatedAt: password.updatedAt },
		secondFactor:
			secondFactor === null
				? null
				: {
						method: secondFactor.method,
						secret: secondFactor.secret,
						confirmedAt: secondFactor.confirmedAt,
						lastStep: secondFactor.lastStep,
					},
		emailVerifiedAt: document.emailVerifiedAt,
		version: document.version,
		createdAt: document.createdAt,
		updatedAt: document.updatedAt,
	};
}

export function toSessionDocument(record: SessionRecord): SessionDocument {
	return {
		_id: record.id,
		tokenHash: record.tokenHash,
		userId: record.userId,
		authenticatedAt: record.authenticatedAt,
		expiresAt: record.expiresAt,
		revokedAt: record.revokedAt,
		createdAt: record.createdAt,
	};
}

export function toSession(document: SessionDocument): SessionRecord {
	return {
		id: document._id,
		tokenHash: document.tokenHash,
		userId: document.userId as Id,
		authenticatedAt: document.authenticatedAt,
		expiresAt: document.expiresAt,
		revokedAt: document.revokedAt,
		createdAt: document.createdAt,
	};
}

export function toTokenDocument(record: TokenRecord): TokenDocument {
	return {
		_id: record.tokenHash,
		kind: record.kind,
		userId: record.userId,
		address: record.address,
		codeHash: record.codeHash,
		attempts: record.attempts,
		expiresAt: record.expiresAt,
		spentAt: record.spentAt,
		createdAt: record.createdAt,
	};
}

export function toToken(document: TokenDocument): TokenRecord {
	return {
		tokenHash: document._id,
		kind: document.kind,
		userId: document.userId as Id,
		address: document.address,
		codeHash: document.codeHash ?? null,
		attempts: document.attempts ?? 0,
		expiresAt: document.expiresAt,
		spentAt: document.spentAt,
		createdAt: document.createdAt,
	};
}
