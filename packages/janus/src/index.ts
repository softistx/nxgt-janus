/**
 * `@nxgt/janus` — embeddable, type-safe authentication and permissions, over a
 * store you provide.
 *
 * This entry point is `janus()` — users, sessions, sign-up, sign-in, e-mail
 * verification and password reset — and what it shares with the permissions
 * module to come: the subject vocabulary, the error family, pagination, time,
 * and ids. Permissions will be `./permissions` when there is an engine behind
 * it. Its vocabulary lives here already, because users need it too —
 * `subjectOf` is the join between the two, and it is a function rather than a
 * convention on purpose.
 *
 * ## The one rule this package is built around
 *
 * **An outage is never an absence.** A store that cannot answer throws; a store
 * that answered and found nothing returns `null`. A caller that maps a failure
 * to `null` or `false` has turned an outage into a silent lockout — everybody
 * who has an account is told they do not. That sentence is inherited from the
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
	formatSubject,
	formatSubjectSet,
	formatTuple,
	parseSubject,
	parseTuple,
} from './subjects/notation';
export {
	isSubjectSet,
	type RelationTuple,
	type Subject,
	type SubjectId,
	type SubjectSet,
	subjectOf,
} from './subjects/subject';
export { type Clock, fixedClock, systemClock } from './time/clock';
export { type Duration, parseDuration } from './time/duration';
