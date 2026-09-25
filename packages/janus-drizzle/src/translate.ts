import { toDataError } from '@nxgt/drizzle';
import { JanusError, StoreConflict, StoreFailure } from '@nxgt/janus';

/**
 * **The database's errors, as the port's.** One file, and one default.
 *
 * | What happens | Becomes |
 * | --- | --- |
 * | A login another user of the type holds | `StoreConflict('login')`, naming the login and the type |
 * | A row with this id already there | nothing: the insert is a retry, and answers what is stored |
 * | A unique violation on **any other constraint** | **`StoreFailure`** |
 * | A check or foreign key refusing a row | **`StoreFailure`** |
 * | Anything else, absolutely | `StoreFailure`, with `@nxgt/drizzle`'s `DataError` as `cause` |
 *
 * The first two are never errors here: a login is written with `on conflict
 * do nothing`, and a login the statement did not write is one somebody else
 * holds — so no conflict is ever told apart by parsing a driver's message.
 *
 * The bold rows go against the obvious reading. A violation the adapter did
 * not mean to cause is an adapter bug, and reporting it as `LOGIN_TAKEN`
 * would tell somebody their login is taken when it is not. The core
 * validated every record before it reached a store, so a constraint refusing
 * one means the adapter and the port disagree — never the caller's fault.
 *
 * **The default is a failure, not an absence.** That branch is what keeps the
 * port's first rule: nothing here answers `null` for an error.
 */

export type Slot = 'users' | 'sessions' | 'tokens' | 'relations';

/** Runs one port method, and makes every rejection one the port allows. */
export async function run<T>(
	slot: Slot,
	operation: string,
	body: () => Promise<T>,
): Promise<T> {
	try {
		return await body();
	} catch (error) {
		// Already the port's — a conflict, a NOT_FOUND after a read.
		if (error instanceof JanusError) throw error;
		throw new StoreFailure(`${slot}.${operation}: the store could not answer`, {
			slot,
			operation,
			cause: toDataError(error),
		});
	}
}

/** The refusal the port promises for a taken login. */
export function loginTaken(
	operation: string,
	type: string,
	login: string,
): StoreConflict {
	return new StoreConflict(
		'login',
		`${operation}: the login is taken by another ${type}`,
		{ login, userType: type, operation },
	);
}
