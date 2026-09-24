import type {
	IdentityRecord,
	SessionRecord,
	TokenRecord,
} from '../identities/port/types';
import { mintIdentityId } from '../ids/identity-id';

/**
 * Records the cases write. Every id is minted, so no two cases — and no two
 * records of one case — ever collide by accident; every collision a case
 * tests is one it wrote on purpose.
 */

export const at = (iso: string): Date => new Date(iso);

/** A fresh identifier value, so each record holds its own unless a case says otherwise. */
const fresh = () => `user-${mintIdentityId()}@example.test`;

export function identityRecord(
	overrides: Partial<IdentityRecord> = {},
): IdentityRecord {
	const email = fresh();
	return {
		id: mintIdentityId(),
		schemaVersion: '1',
		state: 'active',
		traits: { email, name: { first: 'Ada', last: 'Lovelace' } },
		identifiers: [{ type: 'password', value: email }],
		credentials: {
			password: {
				hash: '$scrypt$ln=17,r=8,p=1$c2FsdA==$a2V5',
				updatedAt: at('2026-01-01T00:00:00.000Z'),
			},
		},
		addresses: [
			{ value: email, via: 'email', verified: false, verifiedAt: null },
		],
		metadataPublic: {},
		metadataAdmin: {},
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
		id: mintIdentityId(),
		tokenHash: hexOf(mintIdentityId()),
		identityId: mintIdentityId(),
		aal: 'aal1',
		authenticatedAt: at('2026-01-01T00:00:00.000Z'),
		expiresAt: at('2099-01-01T00:00:00.000Z'),
		revokedAt: null,
		createdAt: at('2026-01-01T00:00:00.000Z'),
		...overrides,
	};
}

export function tokenRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
	return {
		tokenHash: hexOf(mintIdentityId()),
		kind: 'recovery',
		identityId: mintIdentityId(),
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
