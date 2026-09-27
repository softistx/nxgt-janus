import { sql } from 'drizzle-orm';
import { check, index, integer, text } from 'drizzle-orm/pg-core';
import { at, key, type TableOf } from './columns';

/** One-time tokens, keyed by their hash. */
export function tokensTable(table: TableOf) {
	return table(
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
}
