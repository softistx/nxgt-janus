import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	text,
	unique,
} from 'drizzle-orm/pg-core';
import { at, key, type TableFactory } from './columns';

/**
 * Users and their passwords: one row each. `logins` is the port's array,
 * verbatim and in order; its uniqueness is `logins`' primary key.
 */
export function usersTable(table: TableFactory) {
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
			/**
			 * The recovery codes' keyed hashes, in order — `null` read as `[]`,
			 * so a row written before the column existed reads as no codes.
			 */
			secondFactorRecoveryCodes: text('second_factor_recovery_codes').array(),
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
			 * confirmation, last step and recovery codes exist only beside them.
			 */
			check(
				'users_second_factor_whole',
				sql`(${t.secondFactorMethod} is null) = (${t.secondFactorSecret} is null) and (${t.secondFactorMethod} is not null or (${t.secondFactorConfirmedAt} is null and ${t.secondFactorLastStep} is null and ${t.secondFactorRecoveryCodes} is null))`,
			),
			/** `'totp'` is the one method; a step counts up from the epoch. */
			check(
				'users_second_factor_values',
				sql`${t.secondFactorMethod} in ('totp') and ${t.secondFactorLastStep} >= 0`,
			),
		],
	);
}
