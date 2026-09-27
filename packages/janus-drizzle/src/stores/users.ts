import { type PgDatabase, withTransaction } from '@nxgt/drizzle/pg';
import type { UserPatch, UserRecord, UserStore } from '@nxgt/janus';
import { NotFoundError, StoreConflict } from '@nxgt/janus';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { run } from '../translate';
import type { IdentityTables } from './identity-tables';
import { claimLogins } from './logins';
import { toUser, toUserRow, toUserSet } from './records';

export function userStore(db: PgDatabase, tables: IdentityTables): UserStore {
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('users', operation, body);

	return {
		insertUser: (record) =>
			run$('insertUser', () => insertUser(db, tables, record)),

		findUser: (id) => run$('findUser', () => findUser(db, tables, id)),

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
				withTransaction(db, (tx) =>
					updateUser(tx, tables, id, patch, ifVersion),
				),
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

async function findUser(
	db: PgDatabase,
	tables: IdentityTables,
	id: string,
): Promise<UserRecord | null> {
	const [row] = await db
		.select()
		.from(tables.users)
		.where(eq(tables.users.id, id));
	return row === undefined ? null : toUser(row);
}

async function insertUser(
	db: PgDatabase,
	tables: IdentityTables,
	record: UserRecord,
): Promise<UserRecord> {
	const inserted = await withTransaction(db, async (tx) => {
		const [row] = await tx
			.insert(tables.users)
			.values(toUserRow(record))
			.onConflictDoNothing({ target: tables.users.id })
			.returning();
		if (row === undefined) return null;
		await claimLogins(tx, tables, 'insertUser', record, record.logins);
		return toUser(row);
	});
	if (inserted !== null) return inserted;

	// A retry whose first attempt landed: the user with this id is
	// there, and is the answer — logins included, which are theirs.
	const stored = await findUser(db, tables, record.id);
	if (stored !== null) return stored;
	// Deleted between the two statements: a retry of nothing.
	throw new NotFoundError('insertUser: the user was deleted meanwhile', {
		userId: record.id,
		operation: 'insertUser',
	});
}

async function updateUser(
	tx: PgDatabase,
	tables: IdentityTables,
	id: string,
	patch: UserPatch,
	ifVersion: number,
): Promise<UserRecord> {
	const [row] = await tx
		.update(tables.users)
		.set({
			...toUserSet(patch),
			version: sql`${tables.users.version} + 1`,
		})
		.where(and(eq(tables.users.id, id), eq(tables.users.version, ifVersion)))
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
		await claimLogins(tx, tables, 'updateUser', row, patch.logins);
	}
	return toUser(row);
}
