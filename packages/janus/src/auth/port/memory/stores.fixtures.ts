/**
 * Records for the reference store's specs: each one valid as it stands,
 * `overrides` changing only what a case is about. Specs only — no case
 * lives here.
 */

import { mintId } from '../../../ids/id';
import type { SessionRecord, TokenRecord, UserRecord } from '../types';

export const at = (ms: number) => new Date(ms);

export function user(overrides: Partial<UserRecord> = {}): UserRecord {
	return {
		id: mintId(),
		type: 'user',
		schemaVersion: '1',
		active: true,
		fields: { email: 'a@b.test', name: { first: 'Ada', last: 'L' } },
		logins: ['a@b.test'],
		password: { hash: '$argon2id$v=19$…', updatedAt: at(1) },
		secondFactor: null,
		emailVerifiedAt: null,
		version: 0,
		createdAt: at(1),
		updatedAt: at(1),
		...overrides,
	};
}

export function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		id: mintId(),
		tokenHash: crypto.randomUUID(),
		userId: mintId(),
		authenticatedAt: at(1),
		expiresAt: at(1000),
		revokedAt: null,
		createdAt: at(1),
		...overrides,
	};
}

export function token(overrides: Partial<TokenRecord> = {}): TokenRecord {
	return {
		tokenHash: crypto.randomUUID(),
		kind: 'resetPassword',
		userId: mintId(),
		address: 'a@b.test',
		codeHash: null,
		attempts: 0,
		expiresAt: at(1000),
		spentAt: null,
		createdAt: at(1),
		...overrides,
	};
}
