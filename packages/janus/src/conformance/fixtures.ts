import type {
	SessionRecord,
	TokenRecord,
	UserRecord,
} from '../auth/port/types';
import { mintId } from '../ids/id';

/**
 * Records the cases write. Every id is minted, so no two cases — and no two
 * records of one case — ever collide by accident; every collision a case
 * tests is one it wrote on purpose.
 */

export const at = (iso: string): Date => new Date(iso);

/** A fresh login, so each record holds its own unless a case says otherwise. */
const fresh = () => `user-${mintId()}@example.test`;

export function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
	const email = fresh();
	return {
		id: mintId(),
		type: 'user',
		schemaVersion: '1',
		active: true,
		fields: { email, name: { first: 'Ada', last: 'Lovelace' } },
		logins: [email],
		password: {
			hash: '$scrypt$ln=17,r=8,p=1$c2FsdA==$a2V5',
			updatedAt: at('2026-01-01T00:00:00.000Z'),
		},
		emailVerifiedAt: null,
		version: 0,
		createdAt: at('2026-01-01T00:00:00.000Z'),
		updatedAt: at('2026-01-01T00:00:00.000Z'),
		...overrides,
	};
}

export function sessionRecord(
	overrides: Partial<SessionRecord> = {},
): SessionRecord {
	return {
		id: mintId(),
		tokenHash: hexOf(mintId()),
		userId: mintId(),
		authenticatedAt: at('2026-01-01T00:00:00.000Z'),
		expiresAt: at('2099-01-01T00:00:00.000Z'),
		revokedAt: null,
		createdAt: at('2026-01-01T00:00:00.000Z'),
		...overrides,
	};
}

export function tokenRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
	return {
		tokenHash: hexOf(mintId()),
		kind: 'resetPassword',
		userId: mintId(),
		address: fresh(),
		expiresAt: at('2099-01-01T00:00:00.000Z'),
		spentAt: null,
		createdAt: at('2026-01-01T00:00:00.000Z'),
		...overrides,
	};
}

/** A 64-character hex string, shaped like a `sha256`, unique per call. */
function hexOf(seed: string): string {
	return seed.replace(/-/g, '').padEnd(64, '0').slice(0, 64);
}
