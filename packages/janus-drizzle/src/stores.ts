import { type PgDatabase, withTransaction } from '@nxgt/drizzle/pg';
import type {
	Id,
	JanusStores,
	SessionRecord,
	SessionStore,
	TokenStore,
	UserPatch,
	UserRecord,
	UserStore,
} from '@nxgt/janus';
import { NotFoundError, StoreConflict } from '@nxgt/janus';
import { and, asc, eq, gt, isNull, lte, ne, type SQL, sql } from 'drizzle-orm';
import {
	type DrizzleAdapterOptions,
	defineJanusTables,
	type JanusTables,
} from './tables';
import { loginTaken, run } from './translate';

type UserRow = JanusTables['users']['$inferSelect'];
type UserInsert = JanusTables['users']['$inferInsert'];
type SessionRow = JanusTables['sessions']['$inferSelect'];

/** The four tables the identity stores query. */
type IdentityTable = 'users' | 'logins' | 'sessions' | 'tokens';
type IdentityTables = Pick<JanusTables, IdentityTable>;

/**
 * The three stores `janus()` takes, over one PostgreSQL database through
 * Drizzle.
 *
 * ```ts
 * const db = drizzle(process.env.DATABASE_URL);
 * const auth = janus({ user, password: { login: 'email' }, store: createDrizzleStores(db), hasher });
 * ```
 *
 * **Every read is one statement**, whose absence is an empty result, turned
 * into `null` here; everything that arrives as a rejection is a failure. There
 * is no path on which an absence and an outage travel the same channel.
 *
 * **A user is written in one transaction** with its logins, whose table holds
 * their uniqueness — `@nxgt/drizzle`'s `withTransaction`, inside the method,
 * as rule 5 allows. Every other write is one statement.
 *
 * `sessions.deleteExpiredSessions` is implemented: PostgreSQL has no TTL, so
 * `auth.collectExpired()` is how lapsed sessions leave the table.
 *
 * `{ tables }` is what your schema file exports; absent, the tables in the
 * connection's `search_path`.
 */
export function createDrizzleStores(
	db: PgDatabase,
	options: DrizzleAdapterOptions<IdentityTable> = {},
): JanusStores {
	const tables = options.tables ?? defineJanusTables();
	return {
		users: userStore(db, tables),
		sessions: sessionStore(db, tables),
		tokens: tokenStore(db, tables),
	};
}

function userStore(db: PgDatabase, tables: IdentityTables): UserStore {
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('users', operation, body);

	const find = async (id: string) => {
		const [row] = await db
			.select()
			.from(tables.users)
			.where(eq(tables.users.id, id));
		return row === undefined ? null : toUser(row);
	};

	/**
	 * Writes the logins of one user, and throws the port's conflict for the
	 * first one another user of the type holds. `on conflict do nothing`: a
	 * login the statement did not write is one somebody else holds, and a
	 * concurrent sign-up waits for the first to commit, then writes nothing.
	 */
	const claim = async (
		tx: PgDatabase,
		operation: string,
		user: { readonly id: string; readonly type: string },
		logins: readonly string[],
	) => {
		// Sorted: two transactions claiming the same logins take their locks in
		// one order, and never deadlock — the loser waits, then finds them taken.
		const distinct = [...new Set(logins)].sort();
		if (distinct.length === 0) return;
		const written = await tx
			.insert(tables.logins)
			.values(
				distinct.map((login) => ({ type: user.type, login, userId: user.id })),
			)
			.onConflictDoNothing()
			.returning({ login: tables.logins.login });
		if (written.length === distinct.length) return;
		const claimed = new Set(written.map((row) => row.login));
		const taken = distinct.find((login) => !claimed.has(login)) ?? '';
		throw loginTaken(operation, user.type, taken);
	};

	return {
		insertUser: (record) =>
			run$('insertUser', async () => {
				const inserted = await withTransaction(db, async (tx) => {
					const [row] = await tx
						.insert(tables.users)
						.values(toUserRow(record))
						.onConflictDoNothing({ target: tables.users.id })
						.returning();
					if (row === undefined) return null;
					await claim(tx, 'insertUser', record, record.logins);
					return toUser(row);
				});
				if (inserted !== null) return inserted;

				// A retry whose first attempt landed: the user with this id is
				// there, and is the answer — logins included, which are theirs.
				const stored = await find(record.id);
				if (stored !== null) return stored;
				// Deleted between the two statements: a retry of nothing.
				throw new NotFoundError('insertUser: the user was deleted meanwhile', {
					userId: record.id,
					operation: 'insertUser',
				});
			}),

		findUser: (id) => run$('findUser', () => find(id)),

		findUserByLogin: (type, login) =>
			run$('findUserByLogin', async () => {
				const [row] = await db
					.select({ user: tables.users })
					.from(tables.logins)
					.innerJoin(tables.users, eq(tables.users.id, tables.logins.userId))
					.where(
						and(eq(tables.logins.type, type), eq(tables.logins.login, login)),
					);
				return row === undefined ? null : toUser(row.user);
			}),

		listUsers: ({ type, after, limit }) =>
			run$('listUsers', async () => {
				// One more than the page, to know whether another follows.
				const found = await db
					.select()
					.from(tables.users)
					.where(
						after === null
							? eq(tables.users.type, type)
							: and(eq(tables.users.type, type), gt(tables.users.id, after)),
					)
					.orderBy(asc(tables.users.id))
					.limit(limit + 1);
				const items = found.slice(0, limit).map(toUser);
				const last = items.at(-1);
				return {
					items,
					nextCursor:
						found.length > limit && last !== undefined ? last.id : null,
				};
			}),

		updateUser: (id, patch, ifVersion) =>
			run$('updateUser', () =>
				withTransaction(db, async (tx) => {
					const [row] = await tx
						.update(tables.users)
						.set({
							...toUserSet(patch),
							version: sql`${tables.users.version} + 1`,
						})
						.where(
							and(eq(tables.users.id, id), eq(tables.users.version, ifVersion)),
						)
						.returning();

					if (row === undefined) {
						// The write matched nothing, which alone cannot tell an unknown
						// id from a moved version: read again, and say which.
						const [stored] = await tx
							.select({ version: tables.users.version })
							.from(tables.users)
							.where(eq(tables.users.id, id));
						if (stored === undefined) {
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
					}

					if (patch.logins !== undefined) {
						await tx.delete(tables.logins).where(eq(tables.logins.userId, id));
						await claim(tx, 'updateUser', row, patch.logins);
					}
					return toUser(row);
				}),
			),

		deleteUser: (id) =>
			run$('deleteUser', async () => {
				// The logins go with it: their foreign key cascades.
				const deleted = await db
					.delete(tables.users)
					.where(eq(tables.users.id, id))
					.returning({ id: tables.users.id });
				return deleted.length === 1;
			}),
	};
}

function sessionStore(db: PgDatabase, tables: IdentityTables): SessionStore {
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('sessions', operation, body);

	return {
		insertSession: (record) =>
			run$('insertSession', async () => {
				// Idempotent under retry: a session with this id is already there.
				// A collision on the token hash is not a retry, and fails.
				await db
					.insert(tables.sessions)
					.values(record)
					.onConflictDoNothing({ target: tables.sessions.id });
			}),

		findSessionByTokenHash: (tokenHash) =>
			run$('findSessionByTokenHash', async () => {
				const [row] = await db
					.select()
					.from(tables.sessions)
					.where(eq(tables.sessions.tokenHash, tokenHash));
				return row === undefined ? null : toSession(row);
			}),

		extendSession: (id, expiresAt) =>
			run$('extendSession', async () => {
				// `revoked_at is null` in the condition: an extension racing a
				// revocation matches nothing, and never brings the session back.
				const [row] = await db
					.update(tables.sessions)
					.set({ expiresAt })
					.where(
						and(eq(tables.sessions.id, id), isNull(tables.sessions.revokedAt)),
					)
					.returning();
				return row === undefined ? null : toSession(row);
			}),

		revokeSession: (id, at) =>
			run$('revokeSession', async () => {
				// `coalesce`, so a session already revoked keeps its first
				// `revokedAt` and still counts as matched.
				const matched = await db
					.update(tables.sessions)
					.set({
						revokedAt: sql`coalesce(${tables.sessions.revokedAt}, ${stamp(at)})`,
					})
					.where(eq(tables.sessions.id, id))
					.returning({ id: tables.sessions.id });
				return matched.length === 1;
			}),

		revokeUserSessions: (userId, at, except) =>
			run$('revokeUserSessions', async () => {
				const standing = and(
					eq(tables.sessions.userId, userId),
					isNull(tables.sessions.revokedAt),
				);
				const revoked = await db
					.update(tables.sessions)
					.set({ revokedAt: at })
					.where(
						except === undefined
							? standing
							: and(standing, ne(tables.sessions.id, except)),
					)
					.returning({ id: tables.sessions.id });
				return revoked.length;
			}),

		deleteUserSessions: (userId) =>
			run$('deleteUserSessions', async () => {
				const deleted = await db
					.delete(tables.sessions)
					.where(eq(tables.sessions.userId, userId))
					.returning({ id: tables.sessions.id });
				return deleted.length;
			}),

		deleteExpiredSessions: (before) =>
			run$('deleteExpiredSessions', async () => {
				const deleted = await db
					.delete(tables.sessions)
					.where(lte(tables.sessions.expiresAt, before))
					.returning({ id: tables.sessions.id });
				return deleted.length;
			}),
	};
}

function tokenStore(db: PgDatabase, tables: IdentityTables): TokenStore {
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('tokens', operation, body);

	return {
		insertToken: (record) =>
			run$('insertToken', async () => {
				// The hash is the key: a collision is a retry.
				await db.insert(tables.tokens).values(record).onConflictDoNothing();
			}),

		consumeToken: (tokenHash, kind, at) =>
			run$('consumeToken', async () => {
				// **One conditional write**, answering the row as it was before
				// it. `for update` makes a concurrent call wait for this one and
				// then read the spent row, so exactly one caller ever reads
				// `spentAt: null`; `coalesce` keeps a first `spentAt`.
				const before = db.$with('before').as(
					db
						.select()
						.from(tables.tokens)
						.where(
							and(
								eq(tables.tokens.tokenHash, tokenHash),
								eq(tables.tokens.kind, kind),
							),
						)
						.for('update'),
				);
				const [spent] = await db
					.with(before)
					.update(tables.tokens)
					.set({
						spentAt: sql`coalesce(${tables.tokens.spentAt}, ${stamp(at)})`,
					})
					.from(before)
					.where(eq(tables.tokens.tokenHash, before.tokenHash))
					.returning({
						tokenHash: before.tokenHash,
						kind: before.kind,
						userId: before.userId,
						address: before.address,
						codeHash: before.codeHash,
						attempts: before.attempts,
						expiresAt: before.expiresAt,
						spentAt: before.spentAt,
						createdAt: before.createdAt,
					});
				return spent === undefined
					? null
					: { ...spent, userId: spent.userId as Id };
			}),

		countAttempt: (tokenHash, kind) =>
			run$('countAttempt', async () => {
				// **One conditional write**: `attempts + 1` on the row, under the
				// row's lock, so twenty concurrent calls answer twenty counts. A
				// spent token matches nothing here, and is read as it is below.
				const match = and(
					eq(tables.tokens.tokenHash, tokenHash),
					eq(tables.tokens.kind, kind),
				);
				const [counted] = await db
					.update(tables.tokens)
					.set({ attempts: sql`${tables.tokens.attempts} + 1` })
					.where(and(match, isNull(tables.tokens.spentAt)))
					.returning();
				const row =
					counted ?? (await db.select().from(tables.tokens).where(match))[0];
				return row === undefined ? null : { ...row, userId: row.userId as Id };
			}),

		spendUserTokens: (userId, kind, at) =>
			run$('spendUserTokens', async () => {
				// One statement: each row is written under its lock, and
				// re-checked after a concurrent `consumeToken` committed, so the
				// two never both spend it.
				const spent = await db
					.update(tables.tokens)
					.set({ spentAt: at })
					.where(
						and(
							eq(tables.tokens.userId, userId),
							eq(tables.tokens.kind, kind),
							isNull(tables.tokens.spentAt),
						),
					)
					.returning({ tokenHash: tables.tokens.tokenHash });
				return spent.length;
			}),

		deleteUserTokens: (userId) =>
			run$('deleteUserTokens', async () => {
				const deleted = await db
					.delete(tables.tokens)
					.where(eq(tables.tokens.userId, userId))
					.returning({ tokenHash: tables.tokens.tokenHash });
				return deleted.length;
			}),
	};
}

// ─── Rows and records ─────────────────────────────────────────────────────
//
// Each record is rebuilt field by field: the port's records are exactly what
// it declares, and a row carries columns the record names differently.

function toUserRow(record: UserRecord): UserInsert {
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
function toUserSet(patch: UserPatch): Partial<UserInsert> {
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

/** A second factor as its four columns, all `null` for none. */
function toSecondFactorColumns(secondFactor: UserRecord['secondFactor']) {
	return {
		secondFactorMethod: secondFactor?.method ?? null,
		secondFactorSecret: secondFactor?.secret ?? null,
		secondFactorConfirmedAt: secondFactor?.confirmedAt ?? null,
		secondFactorLastStep: secondFactor?.lastStep ?? null,
	};
}

function toUser(row: UserRow): UserRecord {
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
					},
		emailVerifiedAt: row.emailVerifiedAt,
		version: row.version,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function toSession(row: SessionRow): SessionRecord {
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
function stamp(at: Date): SQL {
	return sql`${at.toISOString()}::timestamptz`;
}
