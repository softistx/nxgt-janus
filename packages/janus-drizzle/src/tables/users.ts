import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	primaryKey,
	text,
	unique,
} from 'drizzle-orm/pg-core';
import { at, key, type TableOf } from './columns';

/**
 * Users and their passwords: one row each. `logins` is the port's array,
 * verbatim and in order; its uniqueness is `logins`' primary key.
 */
export function usersTable(table: TableOf) {
	return table(
		'users',
		{
			/** The UUIDv7 the core minted. `text`, not `uuid`: the store parses nothing. */
			id: key('id').primaryKey(),
			type: key('type').notNull(),
			schemaVersion: text('schema_version').notNull(),
			active: boolean('active').notNull(),
			/** The application's fields. The core validated them already. */
			fields: jsonb('fields').notNull(),
			logins: text('logins').array().notNull(),
			passwordHash: text('password_hash'),
			passwordUpdatedAt: at('password_updated_at'),
			/** `'totp'`, or `null` for a user with no second factor. */
			secondFactorMethod: text('second_factor_method', { enum: ['totp'] }),
			/** Sealed by the core with the application's key: never the plain secret. */
			secondFactorSecret: text('second_factor_secret'),
			secondFactorConfirmedAt: at('second_factor_confirmed_at'),
			secondFactorLastStep: integer('second_factor_last_step'),
			emailVerifiedAt: at('email_verified_at'),
			version: integer('version').notNull(),
			createdAt: at('created_at').notNull(),
			updatedAt: at('updated_at').notNull(),
		},
		(t) => [
			/** What `logins` references, so a login's type is its user's. */
			unique('users_id_type_unique').on(t.id, t.type),
			/** `listUsers` reads one type in id order. */
			index('users_type_id').on(t.type, t.id),
			/** A password is a hash and when it was set, or neither. */
			check(
				'users_password_whole',
				sql`(${t.passwordHash} is null) = (${t.passwordUpdatedAt} is null)`,
			),
			/**
			 * A second factor is a method and a secret, or neither; its
			 * confirmation and last step exist only beside them.
			 */
			check(
				'users_second_factor_whole',
				sql`(${t.secondFactorMethod} is null) = (${t.secondFactorSecret} is null) and (${t.secondFactorMethod} is not null or (${t.secondFactorConfirmedAt} is null and ${t.secondFactorLastStep} is null))`,
			),
			/** `'totp'` is the one method; a step counts up from the epoch. */
			check(
				'users_second_factor_values',
				sql`${t.secondFactorMethod} in ('totp') and ${t.secondFactorLastStep} >= 0`,
			),
		],
	);
}

/**
 * **The uniqueness of a login, per type** (rule 3): one row per login a
 * user holds, and the primary key refuses a second holder. PostgreSQL has
 * no unique index over the elements of an array, so this table is that
 * index, written in the same transaction as the user. Deleting the user
 * deletes its rows.
 */
export function loginsTable(
	table: TableOf,
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
