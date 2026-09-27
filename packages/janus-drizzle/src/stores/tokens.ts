import type { PgDatabase } from '@nxgt/drizzle/pg';
import type { Id, TokenKind, TokenRecord, TokenStore } from '@nxgt/janus';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { run } from '../translate';
import type { IdentityTables } from './identity-tables';
import { stamp } from './records';

export function tokenStore(db: PgDatabase, tables: IdentityTables): TokenStore {
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('tokens', operation, body);

	return {
		insertToken: (record) =>
			run$('insertToken', async () => {
				// The hash is the key: a collision is a retry.
				await db.insert(tables.tokens).values(record).onConflictDoNothing();
			}),

		consumeToken: (tokenHash, kind, at) =>
			run$('consumeToken', () => consumeToken(db, tables, tokenHash, kind, at)),

		countAttempt: (tokenHash, kind) =>
			run$('countAttempt', () => countAttempt(db, tables, tokenHash, kind)),

		spendUserTokens: (userId, kind, at, except) =>
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
							except === undefined
								? undefined
								: ne(tables.tokens.tokenHash, except),
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

async function consumeToken(
	db: PgDatabase,
	tables: IdentityTables,
	tokenHash: string,
	kind: TokenKind,
	at: Date,
): Promise<TokenRecord | null> {
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
	return spent === undefined ? null : { ...spent, userId: spent.userId as Id };
}

async function countAttempt(
	db: PgDatabase,
	tables: IdentityTables,
	tokenHash: string,
	kind: TokenKind,
): Promise<TokenRecord | null> {
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
}
