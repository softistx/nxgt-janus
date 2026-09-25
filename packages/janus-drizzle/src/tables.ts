import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	customType,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
} from 'drizzle-orm/pg-core';

/**
 * The five tables, as Drizzle definitions: **your migrations create them**.
 * Export them from the schema file drizzle-kit reads, and `drizzle-kit
 * generate` writes them into your next migration like any table of your own.
 *
 * **Every name starts with `janus_`**, so none collides with an application's
 * own `users` or `sessions`. Columns are `snake_case`, as PostgreSQL's own
 * catalog and `@nxgt/drizzle`'s columns are: a camelCase column would have to
 * be quoted in every query written by hand. The records the stores answer are
 * camelCase, as everywhere in Janus.
 *
 * **What the tables hold is the port's record**, field by field. Nothing is
 * encoded, so a row read in `psql` reads like the record in the code.
 */

/**
 * A key compared byte by byte, as the port asks (rule 4): `collate "C"`. Under
 * a database's default collation, `en_US.UTF-8` or the like, `B` sorts after
 * `a` — and a page in "ascending id order" repeats or skips rows.
 */
const key = customType<{ data: string; driverData: string }>({
	dataType: () => 'text collate "C"',
});

// Millisecond precision: a JavaScript `Date` has no more. At PostgreSQL's
// default of microseconds, a timestamp written and read back is not the one
// the core wrote.
const at = (name: string) =>
	timestamp(name, { withTimezone: true, precision: 3 });

/**
 * Users and their passwords: one row each. `logins` is the port's array,
 * verbatim and in order; its uniqueness is {@link janusLogins}'s.
 */
export const janusUsers = pgTable(
	'janus_users',
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
		emailVerifiedAt: at('email_verified_at'),
		version: integer('version').notNull(),
		createdAt: at('created_at').notNull(),
		updatedAt: at('updated_at').notNull(),
	},
	(t) => [
		/** What {@link janusLogins} references, so a login's type is its user's. */
		unique('janus_users_id_type_unique').on(t.id, t.type),
		/** `listUsers` reads one type in id order. */
		index('janus_users_type_id').on(t.type, t.id),
		/** A password is a hash and when it was set, or neither. */
		check(
			'janus_users_password_whole',
			sql`(${t.passwordHash} is null) = (${t.passwordUpdatedAt} is null)`,
		),
	],
);

/**
 * **The uniqueness of a login, per type** (rule 3): one row per login a user
 * holds, and the primary key refuses a second holder. PostgreSQL has no
 * unique index over the elements of an array, so this table is that index,
 * written in the same transaction as the user. Deleting the user deletes its
 * rows.
 */
export const janusLogins = pgTable(
	'janus_logins',
	{
		type: key('type').notNull(),
		login: key('login').notNull(),
		userId: key('user_id').notNull(),
	},
	(t) => [
		primaryKey({ name: 'janus_logins_pkey', columns: [t.type, t.login] }),
		foreignKey({
			name: 'janus_logins_user_fk',
			columns: [t.userId, t.type],
			foreignColumns: [janusUsers.id, janusUsers.type],
		}).onDelete('cascade'),
		index('janus_logins_user_id').on(t.userId),
	],
);

/**
 * Sessions. No foreign key to the user: deleting a user deletes the user, and
 * the core deletes the sessions next — as it does when they live elsewhere.
 */
export const janusSessions = pgTable(
	'janus_sessions',
	{
		id: key('id').primaryKey(),
		/** `sha256` of the session token. The secret itself is never stored. */
		tokenHash: key('token_hash').notNull(),
		userId: key('user_id').notNull(),
		authenticatedAt: at('authenticated_at').notNull(),
		expiresAt: at('expires_at').notNull(),
		revokedAt: at('revoked_at'),
		createdAt: at('created_at').notNull(),
	},
	(t) => [
		unique('janus_sessions_token_hash_unique').on(t.tokenHash),
		index('janus_sessions_user_id').on(t.userId),
		/** `deleteExpiredSessions`: PostgreSQL has no TTL, so the core collects. */
		index('janus_sessions_expires_at').on(t.expiresAt),
	],
);

/** One-time tokens, keyed by their hash. */
export const janusTokens = pgTable(
	'janus_tokens',
	{
		tokenHash: key('token_hash').primaryKey(),
		kind: text('kind', { enum: ['verifyEmail', 'resetPassword'] }).notNull(),
		userId: key('user_id').notNull(),
		address: text('address').notNull(),
		expiresAt: at('expires_at').notNull(),
		spentAt: at('spent_at'),
		createdAt: at('created_at').notNull(),
	},
	(t) => [
		check(
			'janus_tokens_kind',
			sql`${t.kind} in ('verifyEmail', 'resetPassword')`,
		),
		index('janus_tokens_user_id').on(t.userId),
	],
);

/**
 * Permission tuples, one row each: `record:r1#owner@patient:u1`, or
 * `…@team:t1#member` for a subject set, whose `subject_relation` an entity's
 * row leaves `null`.
 *
 * **The uniqueness of a tuple is the unique constraint**, `nulls not
 * distinct` so two rows for one entity collide — PostgreSQL 15 or later. Its
 * column order is the reverse index `findObjects` pages: every equality
 * first, the object id last.
 */
export const janusRelations = pgTable(
	'janus_relations',
	{
		objectType: key('object_type').notNull(),
		objectId: key('object_id').notNull(),
		relation: key('relation').notNull(),
		subjectType: key('subject_type').notNull(),
		subjectId: key('subject_id').notNull(),
		subjectRelation: key('subject_relation'),
	},
	(t) => [
		unique('janus_relations_tuple_unique')
			.on(
				t.subjectType,
				t.subjectId,
				t.subjectRelation,
				t.relation,
				t.objectType,
				t.objectId,
			)
			.nullsNotDistinct(),
		/** One hop forwards: `findSubjectSets`, `findEntities`, `deleteEntity` as the object. */
		index('janus_relations_object').on(t.objectType, t.objectId, t.relation),
	],
);

/** The five tables, in the order a migration creates them. */
export const janusTables = {
	janusUsers,
	janusLogins,
	janusSessions,
	janusTokens,
	janusRelations,
} as const;
