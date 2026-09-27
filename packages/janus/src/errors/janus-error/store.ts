import { JanusError } from './base';
import type { JanusErrorCode } from './codes';
import type { JanusErrorOptions } from './options';

/**
 * The store could not answer.
 *
 * **This is the class an adapter throws**, and it is exported for that reason:
 * an adapter defines no error class of its own, so `instanceof` holds across
 * the two packages. Any other throw from a store is treated as a failure too —
 * throwing this one is how an adapter says so precisely, and sets `cause`.
 */
export class StoreFailure extends JanusError {
	override name = 'StoreFailure';
	override readonly code = 'STORE_FAILED' as const;
}

/**
 * A uniqueness or a version constraint the store refused.
 *
 * Also thrown by an adapter, and also for the `instanceof` reason. `on` says
 * which constraint, because the two are answered differently: a login
 * collision is the caller's to fix, a version conflict is a retry.
 */
export class StoreConflict extends JanusError {
	override name = 'StoreConflict';
	override readonly code: JanusErrorCode;
	readonly on: 'login' | 'version';

	constructor(
		on: 'login' | 'version',
		message: string,
		options?: JanusErrorOptions,
	) {
		super(message, options);
		this.on = on;
		this.code = on === 'login' ? 'LOGIN_TAKEN' : 'VERSION_CONFLICT';
	}
}

/** There is no such record, and the store said so. */
export class NotFoundError extends JanusError {
	override name = 'NotFoundError';
	override readonly code = 'NOT_FOUND' as const;
}
