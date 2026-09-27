import type { StoreConflict, StoreFailure } from '@nxgt/janus';
import {
	type DuplicateKey,
	loginTaken,
	takenLogin,
	unexpectedDuplicate,
} from '../translate';

/** A duplicate on the login index as the port's conflict, and any other as a bug. */
export function refuseDuplicate(
	operation: string,
	duplicate: DuplicateKey,
): StoreConflict | StoreFailure {
	const taken = takenLogin(duplicate);
	return taken === null
		? unexpectedDuplicate('users', operation, duplicate)
		: loginTaken(operation, taken, duplicate);
}
