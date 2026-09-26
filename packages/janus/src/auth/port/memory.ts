import { NotFoundError, StoreConflict } from '../../errors/janus-error';
import type { Id } from '../../ids/id';
import type {
	JanusStores,
	SessionId,
	SessionRecord,
	SessionStore,
	TokenRecord,
	TokenStore,
	UserPatch,
	UserRecord,
	UserStore,
} from './types';

/**
 * The reference implementation of the store port, in memory.
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
export function createMemoryStores(): JanusStores {
	return {
		users: memoryUserStore(),
		sessions: memorySessionStore(),
		tokens: memoryTokenStore(),
	};
}

const copy = <T>(value: T): T => structuredClone(value);

/** The unique key of one login. `\u0000` cannot occur in a type name the core accepts. */
const keyOf = (type: string, login: string): string => `${type}\u0000${login}`;

function memoryUserStore(): UserStore {
	const byId = new Map<Id, UserRecord>();
	// The unique index: (type, login) key → the id holding it.
	const byLogin = new Map<string, Id>();

	/** The first of `logins` held by a user of `type` other than `id`. */
	const takenBy = (
		type: string,
		logins: readonly string[],
		id: Id,
	): string | undefined =>
		logins.find((login) => {
			const holder = byLogin.get(keyOf(type, login));
			return holder !== undefined && holder !== id;
		});

	const taken = (operation: string, type: string, login: string) =>
		new StoreConflict(
			'login',
			`${operation}: the login is taken by another ${type}`,
			{ login, userType: type, operation },
		);

	return {
		async insertUser(record) {
			const stored = byId.get(record.id);
			if (stored !== undefined) return copy(stored);

			const collision = takenBy(record.type, record.logins, record.id);
			if (collision !== undefined) {
				throw taken('insertUser', record.type, collision);
			}

			const written = copy(record);
			byId.set(written.id, written);
			for (const login of written.logins) {
				byLogin.set(keyOf(written.type, login), written.id);
			}

			return copy(written);
		},

		async findUser(id) {
			const stored = byId.get(id);
			return stored === undefined ? null : copy(stored);
		},

		async findUserByLogin(type, login) {
			const id = byLogin.get(keyOf(type, login));
			const stored = id === undefined ? undefined : byId.get(id);
			return stored === undefined ? null : copy(stored);
		},

		async listUsers({ type, after, limit }) {
			// A Map keeps insertion order, not id order: a retried insert or an
			// id minted on another machine can land out of sequence.
			const ids = [...byId.values()]
				.filter((user) => user.type === type)
				.map((user) => user.id)
				.filter((id) => after === null || id > after)
				.sort();
			const pageIds = ids.slice(0, limit);
			const last = pageIds.at(-1);

			return {
				items: pageIds.map((id) => copy(byId.get(id) as UserRecord)),
				nextCursor: ids.length > limit && last !== undefined ? last : null,
			};
		},

		async updateUser(id, patch, ifVersion) {
			const stored = byId.get(id);

			if (stored === undefined) {
				throw new NotFoundError('updateUser: no user has this id', {
					userId: id,
					operation: 'updateUser',
				});
			}

			if (stored.version !== ifVersion) {
				throw new StoreConflict(
					'version',
					`updateUser: expected version ${ifVersion}, found ${stored.version}`,
					{
						userId: id,
						expectedVersion: ifVersion,
						actualVersion: stored.version,
						operation: 'updateUser',
					},
				);
			}

			if (patch.logins !== undefined) {
				const collision = takenBy(stored.type, patch.logins, id);
				if (collision !== undefined) {
					throw taken('updateUser', stored.type, collision);
				}
			}

			const written = applyPatch(stored, copy(patch));

			byId.set(id, written);
			if (patch.logins !== undefined) {
				for (const login of stored.logins) {
					byLogin.delete(keyOf(stored.type, login));
				}
				for (const login of written.logins) {
					byLogin.set(keyOf(written.type, login), id);
				}
			}

			return copy(written);
		},

		async deleteUser(id) {
			const stored = byId.get(id);
			if (stored === undefined) return false;

			byId.delete(id);
			for (const login of stored.logins) {
				byLogin.delete(keyOf(stored.type, login));
			}
			return true;
		},
	};
}

/**
 * The record a patch produces: the fields it names, replaced whole; the fields
 * it does not name, untouched.
 *
 * Reads each field by name rather than spreading the patch, so a key the port
 * does not declare — `version`, `id`, `type`, `createdAt`, or a `snake_case`
 * typo from JavaScript — never reaches the record. A key present as
 * `undefined` is absent, never an erasure.
 */
function applyPatch(stored: UserRecord, patch: UserPatch): UserRecord {
	return {
		...stored,
		schemaVersion: patch.schemaVersion ?? stored.schemaVersion,
		active: patch.active ?? stored.active,
		fields: patch.fields ?? stored.fields,
		logins: patch.logins ?? stored.logins,
		password: patch.password === undefined ? stored.password : patch.password,
		secondFactor:
			patch.secondFactor === undefined
				? stored.secondFactor
				: patch.secondFactor,
		emailVerifiedAt:
			patch.emailVerifiedAt === undefined
				? stored.emailVerifiedAt
				: patch.emailVerifiedAt,
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

		async revokeUserSessions(userId, at, except) {
			let revoked = 0;

			for (const [id, stored] of byId) {
				if (
					stored.userId === userId &&
					stored.revokedAt === null &&
					id !== except
				) {
					revoke(id, stored, at);
					revoked += 1;
				}
			}

			return revoked;
		},

		async deleteUserSessions(userId) {
			let deleted = 0;

			for (const [id, stored] of byId) {
				if (stored.userId === userId) {
					byId.delete(id);
					byTokenHash.delete(stored.tokenHash);
					deleted += 1;
				}
			}

			return deleted;
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

		async countAttempt(tokenHash, kind) {
			// The same single conditional write as consumeToken: no `await`
			// between the read and the write.
			const stored = byTokenHash.get(tokenHash);
			if (stored === undefined || stored.kind !== kind) return null;
			if (stored.spentAt !== null) return copy(stored);

			const counted = { ...stored, attempts: stored.attempts + 1 };
			byTokenHash.set(tokenHash, counted);
			return copy(counted);
		},

		async spendUserTokens(userId, kind, at, except) {
			let spent = 0;

			for (const [tokenHash, stored] of byTokenHash) {
				if (
					tokenHash !== except &&
					stored.userId === userId &&
					stored.kind === kind &&
					stored.spentAt === null
				) {
					byTokenHash.set(tokenHash, { ...stored, spentAt: new Date(at) });
					spent += 1;
				}
			}

			return spent;
		},

		async deleteUserTokens(userId) {
			let deleted = 0;

			for (const [tokenHash, stored] of byTokenHash) {
				if (stored.userId === userId) {
					byTokenHash.delete(tokenHash);
					deleted += 1;
				}
			}

			return deleted;
		},
	};
}
