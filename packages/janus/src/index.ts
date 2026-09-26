/**
 * `@nxgt/janus` — embeddable, type-safe identities and permissions, over a
 * store you provide.
 *
 * This entry point is the identities side, `janus()` — users, sessions,
 * sign-up, sign-in, e-mail verification and password reset — and what it
 * shares with the permissions side: the subject vocabulary, the error family,
 * pagination, time, and ids. Permissions are `@nxgt/janus/permissions`, and
 * neither side loads the other's code. Their vocabulary lives here, because
 * users need it too — `subjectOf` is the join between the two, and it
 * is a function rather than a convention on purpose.
 *
 * ## The one rule this package is built around
 *
 * **An outage is never an absence.** A store that cannot answer throws; a store
 * that answered and found nothing returns `null`. A caller that maps a failure
 * to `null` or `false` has turned an outage into a silent lockout — every user
 * is told they do not exist. That sentence is inherited from the
 * Ory layer this package is an alternative to, where it had to be learned twice
 * in two days, and here it is a term of the port rather than a line of prose:
 * `@nxgt/janus/conformance` fails an adapter that breaks it.
 */

export * from './auth/index';
export {
	CredentialError,
	type CredentialRefusal,
	InvalidCursorError,
	type Issue,
	JanusError,
	type JanusErrorCode,
	type JanusErrorOptions,
	NotFoundError,
	PermissionDepthError,
	StoreConflict,
	StoreFailure,
	TokenError,
	UnsupportedError,
	UserInactiveError,
	UserInvalidError,
} from './errors/janus-error';
export {
	type Id,
	isId,
	mintedAt,
	mintId,
} from './ids/id';
export {
	type CursorPage,
	DEFAULT_PAGE_SIZE,
	invalidCursor,
	MAX_PAGE_SIZE,
	pageLimit,
} from './pagination/cursor-page';
export {
	formatEntity,
	formatSubject,
	formatTuple,
	parseSubject,
	parseTuple,
} from './subjects/notation';
export {
	type Entity,
	isSubjectSet,
	type RelationTuple,
	type SetOf,
	type Subject,
	type SubjectId,
	type SubjectSet,
	setOf,
	subjectOf,
} from './subjects/subject';
export { type Clock, fixedClock, systemClock } from './time/clock';
export { type Duration, parseDuration } from './time/duration';
