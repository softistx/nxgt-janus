import { NotFoundError, StoreConflict } from '../../errors/janus-error';
import type { IdentityId } from '../../ids/identity-id';
import type {
	IdentityIdentifier,
	IdentityPatch,
	IdentityRecord,
	IdentityStore,
	IdentityStores,
	SessionId,
	SessionRecord,
	SessionStore,
	TokenRecord,
	TokenStore,
} from './types';

/**
 * The reference implementation of the identity store port, in memory.
 *
 * **Shipped and documented, not a test helper.** It is what a consumer uses in
 * their own unit tests, and what an adapter author compares against when a
 * conformance case they do not understand turns red. So it keeps the six rules
 * for real rather than approximately:
 *
 * - uniqueness is a constraint — an index checked and written inside the same
 *   synchronous step, which is what atomic means on one event loop;
 * - `consumeToken` reads and writes with no `await` between the two, so twenty
 *   concurrent calls see exactly one unspent token;
 * - every record is **copied in and copied out**, so a caller that mutates what
 *   it passed or what it got back cannot reach the store — the in-memory
 *   version of "bytes round-trip";
 * - a patch applies only the fields it names, and only the fields the port
 *   declares: a stray `version` or `id` in a patch from JavaScript is ignored,
 *   not written.
 *
 * Every method is `async` even though none waits on anything: a caller that
 * forgot an `await` must fail here the way it would against a real database.
 */
export function createMemoryStores(): IdentityStores {
	return {
		identities: memoryIdentityStore(),
		sessions: memorySessionStore(),
		tokens: memoryTokenStore(),
	};
}

const copy = <T>(value: T): T => structuredClone(value);

/** The unique key of one identifier. `\u0000` cannot occur in a credential type. */
const keyOf = (identifier: IdentityIdentifier): string =>
	`${identifier.type}\u0000${identifier.value}`;

function memoryIdentityStore(): IdentityStore {
	const byId = new Map<IdentityId, IdentityRecord>();
	// The unique index: identifier key → the id holding it.
	const byIdentifier = new Map<string, IdentityId>();

	/** The first identifier in `identifiers` held by an identity other than `id`. */
	const takenBy = (
		identifiers: readonly IdentityIdentifier[],
		id: IdentityId,
	): IdentityIdentifier | undefined =>
		identifiers.find((identifier) => {
			const holder = byIdentifier.get(keyOf(identifier));
			return holder !== undefined && holder !== id;
		});

	const taken = (operation: string, identifier: IdentityIdentifier) =>
		new StoreConflict(
			'identifier',
			`${operation}: the ${identifier.type} identifier "${identifier.value}" is taken`,
			{
				identifier: identifier.value,
				credentialType: identifier.type,
				operation,
			},
		);

	return {
		async insertIdentity(record) {
			const stored = byId.get(record.id);
			if (stored !== undefined) return copy(stored);

			const collision = takenBy(record.identifiers, record.id);
			if (collision !== undefined) throw taken('insertIdentity', collision);

			const written = copy(record);
			byId.set(written.id, written);
			for (const identifier of written.identifiers) {
				byIdentifier.set(keyOf(identifier), written.id);
			}

			return copy(written);
		},

		async findIdentity(id) {
			const stored = byId.get(id);
			return stored === undefined ? null : copy(stored);
		},

		async findIdentityByIdentifier(type, value) {
			const id = byIdentifier.get(keyOf({ type, value }));
			const stored = id === undefined ? undefined : byId.get(id);
			return stored === undefined ? null : copy(stored);
		},

		async listIdentities({ after, limit }) {
			// A Map keeps insertion order, not id order: a retried insert or an
			// id minted on another machine can land out of sequence.
			const ids = [...byId.keys()]
				.filter((id) => after === null || id > after)
				.sort();
			const pageIds = ids.slice(0, limit);
			const last = pageIds.at(-1);

			return {
				items: pageIds.map((id) => copy(byId.get(id) as IdentityRecord)),
				nextCursor: ids.length > limit && last !== undefined ? last : null,
			};
		},

		async updateIdentity(id, patch, ifVersion) {
			const stored = byId.get(id);

			if (stored === undefined) {
				throw new NotFoundError('updateIdentity: no identity has this id', {
					identityId: id,
					operation: 'updateIdentity',
				});
			}

			if (stored.version !== ifVersion) {
				throw new StoreConflict(
					'version',
					`updateIdentity: expected version ${ifVersion}, found ${stored.version}`,
					{
						identityId: id,
						expectedVersion: ifVersion,
						actualVersion: stored.version,
						operation: 'updateIdentity',
					},
				);
			}

			if (patch.identifiers !== undefined) {
				const collision = takenBy(patch.identifiers, id);
				if (collision !== undefined) throw taken('updateIdentity', collision);
			}

			const written = applyPatch(stored, copy(patch));

			byId.set(id, written);
			if (patch.identifiers !== undefined) {
				for (const identifier of stored.identifiers) {
					byIdentifier.delete(keyOf(identifier));
				}
				for (const identifier of written.identifiers) {
					byIdentifier.set(keyOf(identifier), id);
				}
			}

			return copy(written);
		},
	};
}

/**
 * The record a patch produces: the fields it names, replaced whole; the fields
 * it does not name, untouched; `credentials` slot by slot.
 *
 * Reads each field by name rather than spreading the patch, so a key the port
 * does not declare — `version`, `id`, `createdAt`, or a `snake_case` typo from
 * JavaScript — never reaches the record. A key present as `undefined` is
 * absent, never an erasure.
 */
function applyPatch(
	stored: IdentityRecord,
	patch: IdentityPatch,
): IdentityRecord {
	const password = patch.credentials?.password;

	return {
		...stored,
		schemaVersion: patch.schemaVersion ?? stored.schemaVersion,
		state: patch.state ?? stored.state,
		traits: patch.traits ?? stored.traits,
		identifiers: patch.identifiers ?? stored.identifiers,
		credentials: {
			password: password === undefined ? stored.credentials.password : password,
		},
		addresses: patch.addresses ?? stored.addresses,
		metadataPublic: patch.metadataPublic ?? stored.metadataPublic,
		metadataAdmin: patch.metadataAdmin ?? stored.metadataAdmin,
		version: stored.version + 1,
		updatedAt: patch.updatedAt,
	};
}

function memorySessionStore(): SessionStore {
	const byId = new Map<SessionId, SessionRecord>();
	const byTokenHash = new Map<string, SessionId>();

	const revoke = (id: SessionId, stored: SessionRecord, at: Date): void => {
		byId.set(id, { ...stored, revokedAt: new Date(at) });
	};

	return {
		async insertSession(record) {
			if (byId.has(record.id)) return;

			const written = copy(record);
			byId.set(written.id, written);
			byTokenHash.set(written.tokenHash, written.id);
		},

		async findSessionByTokenHash(tokenHash) {
			const id = byTokenHash.get(tokenHash);
			const stored = id === undefined ? undefined : byId.get(id);
			return stored === undefined ? null : copy(stored);
		},

		async extendSession(id, expiresAt) {
			const stored = byId.get(id);
			if (stored === undefined || stored.revokedAt !== null) return null;

			const written: SessionRecord = {
				...stored,
				expiresAt: new Date(expiresAt),
			};
			byId.set(id, written);
			return copy(written);
		},

		async revokeSession(id, at) {
			const stored = byId.get(id);
			if (stored === undefined) return false;

			if (stored.revokedAt === null) revoke(id, stored, at);
			return true;
		},

		async revokeIdentitySessions(identityId, at, except) {
			let revoked = 0;

			for (const [id, stored] of byId) {
				if (
					stored.identityId === identityId &&
					stored.revokedAt === null &&
					id !== except
				) {
					revoke(id, stored, at);
					revoked += 1;
				}
			}

			return revoked;
		},

		async deleteExpiredSessions(before) {
			let deleted = 0;

			for (const [id, stored] of byId) {
				if (stored.expiresAt.getTime() <= before.getTime()) {
					byId.delete(id);
					byTokenHash.delete(stored.tokenHash);
					deleted += 1;
				}
			}

			return deleted;
		},
	};
}

function memoryTokenStore(): TokenStore {
	const byTokenHash = new Map<string, TokenRecord>();

	return {
		async insertToken(record) {
			if (byTokenHash.has(record.tokenHash)) return;
			byTokenHash.set(record.tokenHash, copy(record));
		},

		async consumeToken(tokenHash, kind, at) {
			// No `await` between this read and the write below: on one event loop
			// that is what makes the pair a single conditional write.
			const stored = byTokenHash.get(tokenHash);
			if (stored === undefined || stored.kind !== kind) return null;

			const before = copy(stored);
			if (stored.spentAt === null) {
				byTokenHash.set(tokenHash, { ...stored, spentAt: new Date(at) });
			}

			return before;
		},
	};
}
