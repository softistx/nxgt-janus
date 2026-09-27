/**
 * Everything this package throws at call time, gathered from the files beside
 * this one: the codes a caller switches on (`codes.ts`), what an error carries
 * beside its code (`options.ts`), the base class (`base.ts`), what a store
 * throws (`store.ts`) and what a flow refuses (`refusals.ts`).
 *
 * Each class is defined once, in one of those files; this one only re-exports
 * them, so `instanceof` still holds whichever path a module imports from.
 */

export { JanusError } from './base';
export type { JanusErrorCode } from './codes';
export type { CredentialRefusal, Issue, JanusErrorOptions } from './options';
export {
	CredentialError,
	InvalidCursorError,
	PermissionDepthError,
	SecondFactorError,
	TokenError,
	UnsupportedError,
	UserInactiveError,
	UserInvalidError,
} from './refusals';
export { NotFoundError, StoreConflict, StoreFailure } from './store';
