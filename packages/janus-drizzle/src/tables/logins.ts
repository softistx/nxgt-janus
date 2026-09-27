import { foreignKey, index, primaryKey } from 'drizzle-orm/pg-core';
import { key, type TableFactory } from './columns';
import type { usersTable } from './users';

/**
 * **The uniqueness of a login, per type** (rule 3): one row per login a
 * user holds, and the primary key refuses a second holder. PostgreSQL has
 * no unique index over the elements of an array, so this table is that
 * index, written in the same transaction as the user. Deleting the user
 * deletes its rows.
 */
export function loginsTable(
	table: TableFactory,
	users: ReturnType<typeof usersTable>,
) {
	return table(
		'logins',
		{
			type: key('type').notNull(),
			login: key('login').notNull(),
			userId: key('user_id').notNull(),
		},
		(t) => [
			primaryKey({ name: 'logins_pkey', columns: [t.type, t.login] }),
			foreignKey({
				name: 'logins_user_fk',
				columns: [t.userId, t.type],
				foreignColumns: [users.id, users.type],
			}).onDelete('cascade'),
			index('logins_user_id').on(t.userId),
		],
	);
}
