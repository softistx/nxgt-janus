import { JanusError, StoreConflict, StoreFailure } from '@nxgt/janus';

/**
 * **The driver's errors, as the port's.** One file, and one default.
 *
 * | What happens | Becomes |
 * | --- | --- |
 * | A duplicate key on `(type, logins)` | `StoreConflict('login')`, carrying `login` and `userType` |
 * | A duplicate key on `_id` | nothing — the insert is a retry, and answers what is stored |
 * | A duplicate key on **any other index** | **`StoreFailure`** |
 * | A `$jsonSchema` validation failure (121) | **`StoreFailure`** |
 * | Anything else, absolutely | `StoreFailure`, with the driver error as `cause` |
 *
 * The two bold rows go against the obvious reading. A duplicate on an index
 * the adapter did not mean to collide on is an adapter bug: reporting it as
 * `LOGIN_TAKEN` would tell somebody their login is taken when it is
 * not. And the core has validated every record before it reaches a store, so a
 * validator refusing one means the adapter and the port disagree — never the
 * caller's fault, never a 400.
 *
 * **The default is a failure, not an absence.** That branch is what keeps the
 * port's first rule: nothing here answers `null` for an error.
 */

/** Runs one port method, and makes every rejection one the port allows. */
export async function run<T>(
	slot: 'users' | 'sessions' | 'tokens' | 'relations',
	operation: string,
	body: () => Promise<T>,
): Promise<T> {
	try {
		return await body();
	} catch (error) {
		// Already the port's — a conflict, a NOT_FOUND after a read — or a
		// failure raised below with its own message.
		if (error instanceof JanusError) throw error;
		throw new StoreFailure(`${slot}.${operation}: the store could not answer`, {
			slot,
			operation,
			cause: error,
		});
	}
}

/** The shape of the driver's `E11000`, as far as this file reads it. */
export interface DuplicateKey {
	readonly code: 11000;
	readonly keyPattern?: Readonly<Record<string, unknown>>;
	readonly keyValue?: Readonly<Record<string, unknown>>;
}

export function isDuplicateKey(error: unknown): error is DuplicateKey {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { code?: unknown }).code === 11000
	);
}

/**
 * Settles a write: what it answered when it landed, or the duplicate-key error
 * when an index refused it. **Any other rejection is rethrown**, so a caller
 * of this is only ever told "written" or "duplicate", and never "nothing".
 */
export function settle<T>(
	write: Promise<T>,
): Promise<
	| { readonly written: T }
	| { readonly written?: never; duplicate: DuplicateKey }
> {
	return write.then(
		(written) => ({ written }),
		(error: unknown) => {
			if (isDuplicateKey(error)) return { duplicate: error };
			throw error;
		},
	);
}

/** A login one type holds. */
export interface TypedLogin {
	readonly type: string;
	readonly login: string;
}

/**
 * The login a duplicate names, when it is the login index that refused the
 * write — and `null` for every other index, which the caller then reports as
 * a failure.
 */
export function takenLogin(duplicate: DuplicateKey): TypedLogin | null {
	const type = duplicate.keyValue?.type;
	const login = duplicate.keyValue?.logins;
	if (typeof type !== 'string' || typeof login !== 'string') return null;
	return { type, login };
}

/** The refusal the port promises for a taken login. */
export function loginTaken(
	operation: string,
	{ type, login }: TypedLogin,
	cause: unknown,
): StoreConflict {
	return new StoreConflict(
		'login',
		`${operation}: the login is taken by another ${type}`,
		{ login, userType: type, operation, cause },
	);
}

/** A duplicate on an index the adapter never meant to collide on: a bug, reported as one. */
export function unexpectedDuplicate(
	slot: 'users' | 'sessions' | 'tokens',
	operation: string,
	duplicate: DuplicateKey,
): StoreFailure {
	return new StoreFailure(
		`${slot}.${operation}: a duplicate key on ${Object.keys(duplicate.keyPattern ?? {}).join(', ') || 'an unknown index'}, which this adapter never writes on purpose`,
		{ slot, operation, cause: duplicate },
	);
}
