import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	customType,
	foreignKey,
	index,
	integer,
	jsonb,
	type PgSchema,
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
 * **The names carry no prefix** — `users`, `logins`, `sessions`, `tokens`,
 * `relations` — because the setup this package recommends is **a database of
 * its own**, backed up and restored on its own. Beside an application's own
 * tables, give them a PostgreSQL schema instead: `{ schema: pgSchema('janus') }`
 * makes them `janus.users` and the rest, and `pg_dump -n janus` backs them up
 * alone.
 *
 * Columns are `snake_case`, as PostgreSQL's own catalog and `@nxgt/drizzle`'s
 * columns are: a camelCase column would have to be quoted in every query
 * written by hand. The records the stores answer are camelCase, as everywhere
 * in Janus.
 *
 * **What the tables hold is the port's record**, field by field. Nothing is
 * encoded, so a row read in `psql` reads like the record in the code.
 */

/** Where the tables live. */
export interface JanusTablesOptions {
	/**
	 * A PostgreSQL schema of their own, `pgSchema('janus')`, for a database the
	 * application's tables share. **Export it from the schema file too**:
	 * drizzle-kit writes `CREATE SCHEMA` only for a schema it finds exported.
	 * Absent, the tables are in the connection's `search_path`, `public` by
	 * default: the database of their own.
	 */
	readonly schema?: PgSchema;
}

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
 * The five tables, in the schema `options` names, or in none.
 *
 * ```ts
 * // src/janus/schema.ts — the schema file of Janus's own drizzle-kit config
 * export const { users, logins, sessions, tokens, relations } = defineJanusTables();
 *
 * // or, in a database the application's tables share
 * export const janus = pgSchema('janus');
 * export const { users, logins, sessions, tokens, relations } = defineJanusTables({ schema: janus });
 * ```
 *
 * Pass what the schema file exports to `createDrizzleAdapter` as `{ tables }`,
 * so the stores query the very tables your migration created.
 */
export function defineJanusTables(options: JanusTablesOptions = {}) {
	const { schema } = options;
	const table = (
		schema === undefined ? pgTable : schema.table
	) as typeof pgTable;

	/**
	 * Users and their passwords: one row each. `logins` is the port's array,
	 * verbatim and in order; its uniqueness is `logins`' primary key.
	 */
	const users = table(
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

	/**
	 * **The uniqueness of a login, per type** (rule 3): one row per login a
	 * user holds, and the primary key refuses a second holder. PostgreSQL has
	 * no unique index over the elements of an array, so this table is that
	 * index, written in the same transaction as the user. Deleting the user
	 * deletes its rows.
	 */
	const logins = table(
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

	/**
	 * Sessions. No foreign key to the user: deleting a user deletes the user,
	 * and the core deletes the sessions next — as it does when they live
	 * elsewhere, in Redis.
	 */
	const sessions = table(
		'sessions',
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
			unique('sessions_token_hash_unique').on(t.tokenHash),
			index('sessions_user_id').on(t.userId),
			/** `deleteExpiredSessions`: PostgreSQL has no TTL, so the core collects. */
			index('sessions_expires_at').on(t.expiresAt),
		],
	);

	/** One-time tokens, keyed by their hash. */
	const tokens = table(
		'tokens',
		{
			tokenHash: key('token_hash').primaryKey(),
			kind: text('kind', {
				enum: ['verifyEmail', 'resetPassword', 'secondFactor', 'signInCode'],
			}).notNull(),
			userId: key('user_id').notNull(),
			address: text('address').notNull(),
			/** A sign-in code's hash, keyed by the token's secret. */
			codeHash: text('code_hash'),
			/** Codes tried against it. The default fills the rows a migration finds. */
			attempts: integer('attempts').notNull().default(0),
			expiresAt: at('expires_at').notNull(),
			spentAt: at('spent_at'),
			createdAt: at('created_at').notNull(),
		},
		(t) => [
			check(
				'tokens_kind',
				sql`${t.kind} in ('verifyEmail', 'resetPassword', 'secondFactor', 'signInCode')`,
			),
			check('tokens_attempts', sql`${t.attempts} >= 0`),
			index('tokens_user_id').on(t.userId),
		],
	);

	/**
	 * Permission tuples, one row each: `record:r1#owners@patient:u1`, or
	 * `…@team:t1#members` for a subject set, whose `subject_relation` an
	 * entity's row leaves `null`.
	 *
	 * **The uniqueness of a tuple is the unique constraint**, `nulls not
	 * distinct` so two rows for one entity collide — PostgreSQL 15 or later.
	 * Its column order is the reverse index `findObjects` pages: every equality
	 * first, the object id last.
	 */
	const relations = table(
		'relations',
		{
			objectType: key('object_type').notNull(),
			objectId: key('object_id').notNull(),
			relation: key('relation').notNull(),
			subjectType: key('subject_type').notNull(),
			subjectId: key('subject_id').notNull(),
			subjectRelation: key('subject_relation'),
		},
		(t) => [
			unique('relations_tuple_unique')
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
			index('relations_object').on(t.objectType, t.objectId, t.relation),
		],
	);

	return { users, logins, sessions, tokens, relations };
}

/** The five tables `defineJanusTables` answers. */
export type JanusTables = ReturnType<typeof defineJanusTables>;

/**
 * Which tables the stores query: **the ones your schema file exports**, so
 * the migration and the stores cannot disagree. Absent, `defineJanusTables()`:
 * the tables in the connection's `search_path`.
 *
 * ```ts
 * // src/db/schema.ts
 * export const janus = pgSchema('janus');
 * export const janusTables = defineJanusTables({ schema: janus });
 * export const { users, logins, sessions, tokens, relations } = janusTables;
 *
 * // where the adapter is wired
 * const postgres = createDrizzleAdapter(db, { tables: janusTables });
 * ```
 */
export interface DrizzleAdapterOptions<
	K extends keyof JanusTables = keyof JanusTables,
> {
	readonly tables?: Pick<JanusTables, K>;
}
