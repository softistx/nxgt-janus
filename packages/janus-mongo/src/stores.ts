import type {
	JanusStores,
	SessionRecord,
	SessionStore,
	TokenRecord,
	TokenStore,
	UserPatch,
	UserRecord,
	UserStore,
} from '@nxgt/janus';
import { type Id, NotFoundError, StoreConflict } from '@nxgt/janus';
import {
	type DocumentOf,
	getCollection,
	type SyncOptions,
	type SyncReport,
	syncCollections,
} from '@nxgt/mongo';
import type { Db } from 'mongodb';
import { janusCollections, sessions, tokens, users } from './collections';
import {
	loginTaken,
	run,
	settle,
	takenLogin,
	unexpectedDuplicate,
} from './translate';

type UserDocument = DocumentOf<typeof users>;
type SessionDocument = DocumentOf<typeof sessions>;
type TokenDocument = DocumentOf<typeof tokens>;

/**
 * The three stores `janus()` takes, over one MongoDB database.
 *
 * ```ts
 * const db = (await connectMongo(process.env.MONGO_URI)).db;
 * await syncMongoStores(db); // a deployment step: creates the indexes
 * const auth = janus({ user, password: { login: 'email' }, store: createMongoStores(db), hasher });
 * ```
 *
 * **Reads go through `@nxgt/mongo`'s `find*`, never its `get*`.** `findById`
 * answers `undefined` for an absence, so an absence arrives as a *value*,
 * turned into `null` here, and everything that arrives as a rejection is a
 * failure. There is no path on which an absence and an outage travel the same
 * channel, so there is none on which a `catch` could confuse them.
 *
 * **Every conditional write is one driver call** on `raw`, the driver's own
 * collection: `@nxgt/mongo` names no update conditioned on anything but its
 * own lock, and the port needs `version`, `revokedAt` and `kind`.
 *
 * `sessions.deleteExpiredSessions` is not implemented: a TTL index drops lapsed
 * sessions, so `sessions.collectExpired()` answers `UNSUPPORTED` — which is
 * what the port asks of a store with its own expiry.
 */
export function createMongoStores(db: Db): JanusStores {
	return {
		users: userStore(db),
		sessions: sessionStore(db),
		tokens: tokenStore(db),
	};
}

/**
 * Creates the three collections, their validators and their indexes, and says
 * what it changed. Run it twice and the second run sends nothing.
 *
 * A deployment step, never a request-time one: it needs the `dbAdmin` role,
 * and the core never calls it (rule 6). An application that deploys with
 * `@nxgt/mongo`'s `syncAll(db)` already syncs these three with its own.
 */
export function syncMongoStores(
	db: Db,
	options?: SyncOptions,
): Promise<SyncReport[]> {
	return syncCollections(db, janusCollections, options);
}

function userStore(db: Db): UserStore {
	const collection = getCollection(db, users);
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('users', operation, body);

	const find = async (id: string) => {
		const found = await collection.findById(id);
		return found === undefined ? null : toUser(found);
	};

	/** A duplicate on the login index as the port's conflict, and any other as a bug. */
	const refuse = (
		operation: string,
		duplicate: Parameters<typeof takenLogin>[0],
	) => {
		const taken = takenLogin(duplicate);
		return taken === null
			? unexpectedDuplicate('users', operation, duplicate)
			: loginTaken(operation, taken, duplicate);
	};

	return {
		insertUser: (record) =>
			run$('insertUser', async () => {
				const document = toUserDocument(record);
				const outcome = await settle(collection.raw.insertOne(document));
				if (!('duplicate' in outcome)) return toUser(document);

				// A retry whose first attempt landed: whichever index reported it,
				// the user with this id is there, and is the answer. That includes
				// their own logins, which are not taken by them.
				const stored = await find(record.id);
				if (stored !== null) return stored;
				throw refuse('insertUser', outcome.duplicate);
			}),

		findUser: (id) => run$('findUser', () => find(id)),

		findUserByLogin: (type, login) =>
			run$('findUserByLogin', async () => {
				const found = await collection.findFirst({ type, logins: login });
				return found === undefined ? null : toUser(found);
			}),

		listUsers: ({ type, after, limit }) =>
			run$('listUsers', async () => {
				// One more than the page, to know whether another follows.
				const found = await collection.findMany({
					filter: after === null ? { type } : { type, _id: { $gt: after } },
					sort: { _id: 1 },
					limit: limit + 1,
				});
				const items = found.slice(0, limit).map(toUser);
				const last = items.at(-1);

				return {
					items,
					nextCursor:
						found.length > limit && last !== undefined ? last.id : null,
				};
			}),

		updateUser: (id, patch, ifVersion) =>
			run$('updateUser', async () => {
				const outcome = await settle(
					collection.raw.findOneAndUpdate(
						{ _id: id, version: ifVersion },
						{ $set: toUserSet(patch), $inc: { version: 1 } },
						{ returnDocument: 'after' },
					),
				);

				if ('duplicate' in outcome) {
					throw refuse('updateUser', outcome.duplicate);
				}
				if (outcome.written !== null) return toUser(outcome.written);

				// The write matched nothing, which alone cannot tell an unknown id
				// from a moved version: read again, and say which.
				const stored = await find(id);
				if (stored === null) {
					throw new NotFoundError('updateUser: no user has this id', {
						userId: id,
						operation: 'updateUser',
					});
				}
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
			}),

		deleteUser: (id) =>
			run$('deleteUser', async () => {
				const result = await collection.raw.deleteOne({ _id: id });
				return result.deletedCount === 1;
			}),
	};
}

function sessionStore(db: Db): SessionStore {
	const collection = getCollection(db, sessions);
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('sessions', operation, body);

	return {
		insertSession: (record) =>
			run$('insertSession', async () => {
				const outcome = await settle(
					collection.raw.insertOne(toSessionDocument(record)),
				);
				if (!('duplicate' in outcome)) return;

				// Idempotent under retry: a session with this id is already there.
				if ((await collection.findById(record.id)) !== undefined) return;
				throw unexpectedDuplicate(
					'sessions',
					'insertSession',
					outcome.duplicate,
				);
			}),

		findSessionByTokenHash: (tokenHash) =>
			run$('findSessionByTokenHash', async () => {
				const found = await collection.findFirst({ tokenHash });
				return found === undefined ? null : toSession(found);
			}),

		extendSession: (id, expiresAt) =>
			run$('extendSession', async () => {
				// `revokedAt: null` in the filter: an extension racing a revocation
				// matches nothing, and never brings the session back.
				const written = await collection.raw.findOneAndUpdate(
					{ _id: id, revokedAt: null },
					{ $set: { expiresAt } },
					{ returnDocument: 'after' },
				);
				return written === null ? null : toSession(written);
			}),

		revokeSession: (id, at) =>
			run$('revokeSession', async () => {
				// A pipeline, so a session already revoked keeps its first
				// `revokedAt` and still counts as matched.
				const result = await collection.raw.updateOne({ _id: id }, [
					{ $set: { revokedAt: { $ifNull: ['$revokedAt', at] } } },
				]);
				return result.matchedCount === 1;
			}),

		revokeUserSessions: (userId, at, except) =>
			run$('revokeUserSessions', async () => {
				const result = await collection.raw.updateMany(
					except === undefined
						? { userId, revokedAt: null }
						: { userId, revokedAt: null, _id: { $ne: except } },
					{ $set: { revokedAt: at } },
				);
				return result.modifiedCount;
			}),

		deleteUserSessions: (userId) =>
			run$('deleteUserSessions', async () => {
				const result = await collection.raw.deleteMany({ userId });
				return result.deletedCount;
			}),
	};
}

function tokenStore(db: Db): TokenStore {
	const collection = getCollection(db, tokens);
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('tokens', operation, body);

	return {
		insertToken: (record) =>
			run$('insertToken', async () => {
				// `_id` is the hash, the only unique index: a duplicate is a retry.
				await settle(collection.raw.insertOne(toTokenDocument(record)));
			}),

		consumeToken: (tokenHash, kind, at) =>
			run$('consumeToken', async () => {
				// **One conditional write**, answering the document as it was
				// before it. The pipeline keeps a first `spentAt`, so exactly one
				// caller ever reads `spentAt: null`.
				const before = await collection.raw.findOneAndUpdate(
					{ _id: tokenHash, kind },
					[{ $set: { spentAt: { $ifNull: ['$spentAt', at] } } }],
					{ returnDocument: 'before' },
				);
				return before === null ? null : toToken(before);
			}),

		countAttempt: (tokenHash, kind) =>
			run$('countAttempt', async () => {
				// **One conditional write**, answering the document after it: an
				// unspent token gets one more attempt, atomically. A spent one is
				// matched by the second read below, and written nothing.
				const after = await collection.raw.findOneAndUpdate(
					{ _id: tokenHash, kind, spentAt: null },
					{ $inc: { attempts: 1 } },
					{ returnDocument: 'after' },
				);
				if (after !== null) return toToken(after);
				const spent = await collection.raw.findOne({ _id: tokenHash, kind });
				return spent === null ? null : toToken(spent);
			}),

		spendUserTokens: (userId, kind, at) =>
			run$('spendUserTokens', async () => {
				// Each document is matched and written in one step, as
				// `consumeToken` does: a token it spends at the same moment is
				// counted by exactly one of the two.
				const result = await collection.raw.updateMany(
					{ userId, kind, spentAt: null },
					{ $set: { spentAt: at } },
				);
				return result.modifiedCount;
			}),

		deleteUserTokens: (userId) =>
			run$('deleteUserTokens', async () => {
				const result = await collection.raw.deleteMany({ userId });
				return result.deletedCount;
			}),
	};
}

// ─── Documents and records ────────────────────────────────────────────────
//
// Each record is rebuilt field by field, never spread from a document: a
// spread would hand the core `_id` and the `id` getter `@nxgt/mongo` adds,
// and the port's records are exactly what it declares.

function toUserDocument(record: UserRecord): UserDocument {
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
function toUserSet(patch: UserPatch): Record<string, unknown> {
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

function toUser(document: UserDocument): UserRecord {
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

function toSessionDocument(record: SessionRecord): SessionDocument {
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

function toSession(document: SessionDocument): SessionRecord {
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

function toTokenDocument(record: TokenRecord): TokenDocument {
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

function toToken(document: TokenDocument): TokenRecord {
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
