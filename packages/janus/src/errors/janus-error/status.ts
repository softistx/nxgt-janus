import type { JanusErrorCode } from './codes';

/**
 * Every HTTP status `statusOf` answers: a union of literals, so a framework
 * whose response takes a narrower type than `number` accepts it as it is.
 */
export type JanusErrorStatus = 400 | 401 | 403 | 404 | 409 | 500 | 501 | 503;

/**
 * The HTTP status each code deserves — the one table the integrations share,
 * so a Hono route and a GraphQL field answer the same code the same way.
 * Exhaustive: a code added to `JanusErrorCode` stops this file compiling
 * instead of answering `undefined`.
 *
 * `STORE_FAILED` is 503 and nothing else — **an outage is not a negative
 * answer**, and a 401 or a 404 would tell every user they do not exist.
 *
 * ```ts
 * if (error instanceof JanusError) return Response.json({ code: error.code }, { status: statusOf(error.code) });
 * ```
 */
export function statusOf(code: JanusErrorCode): JanusErrorStatus {
	switch (code) {
		case 'STORE_FAILED':
			return 503;
		case 'NOT_FOUND':
			return 404;
		case 'LOGIN_TAKEN':
		case 'VERSION_CONFLICT':
		case 'SECOND_FACTOR_NOT_ENROLLED':
		case 'SECOND_FACTOR_ACTIVE':
			return 409;
		case 'USER_INVALID':
		case 'PASSWORD_TOO_SHORT':
		case 'HASH_UNSUPPORTED':
		case 'INVALID_CURSOR':
		case 'TOKEN_UNKNOWN':
		case 'TOKEN_SPENT':
		case 'TOKEN_EXPIRED':
		case 'TOKEN_STALE':
			return 400;
		case 'CREDENTIALS_INVALID':
		case 'CODE_INVALID':
			return 401;
		case 'USER_INACTIVE':
		case 'STEP_UP_REQUIRED':
			return 403;
		case 'UNSUPPORTED':
			return 501;
		case 'PERMISSION_DEPTH':
			return 500;
	}
}
