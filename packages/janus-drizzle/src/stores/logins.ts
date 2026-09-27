import type { PgDatabase } from '@nxgt/drizzle/pg';
import { loginTaken } from '../translate';
import type { IdentityTables } from './identity-tables';

/**
 * Writes the logins of one user, and throws the port's conflict for the
 * first one another user of the type holds. `on conflict do nothing`: a
 * login the statement did not write is one somebody else holds, and a
 * concurrent sign-up waits for the first to commit, then writes nothing.
 */
export async function claimLogins(
	tx: PgDatabase,
	tables: IdentityTables,
	operation: string,
	user: { readonly id: string; readonly type: string },
	logins: readonly string[],
): Promise<void> {
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
}
