import { JanusError, type JanusErrorCode } from '@nxgt/janus';
import type { Context, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * The status each code deserves. Exhaustive: a code added to `@nxgt/janus`
 * stops this file compiling instead of answering `undefined`.
 *
 * `STORE_FAILED` is 503 and nothing else — **an outage is not a negative
 * answer**, and a 401 or a 404 would tell every user they do not exist.
 */
export function statusOf(code: JanusErrorCode): ContentfulStatusCode {
	switch (code) {
		case 'STORE_FAILED':
			return 503;
		case 'NOT_FOUND':
			return 404;
		case 'LOGIN_TAKEN':
		case 'VERSION_CONFLICT':
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
			return 401;
		case 'USER_INACTIVE':
			return 403;
		case 'UNSUPPORTED':
			return 501;
		case 'PERMISSION_DEPTH':
			return 500;
	}
}

/**
 * The body a refusal is answered with: its `code`, and only what the client
 * can act on — the fields that failed the schema, the policy's minimum. Never
 * `reason`, `login`, a hash prefix or a cause: those are for your logs.
 */
export function bodyOf(error: JanusError): {
	readonly code: JanusErrorCode;
	readonly issues?: JanusError['issues'];
	readonly minLength?: number;
} {
	switch (error.code) {
		case 'USER_INVALID':
			return { code: error.code, issues: error.issues ?? [] };
		case 'PASSWORD_TOO_SHORT':
			return error.minLength === undefined
				? { code: error.code }
				: { code: error.code, minLength: error.minLength };
		default:
			return { code: error.code };
	}
}

/**
 * Hono's own answer to an error it was not told about: the response of an
 * `HTTPException`, and a logged 500 for anything else.
 */
function honoDefault(error: Error, c: Context): Response {
	if (error instanceof HTTPException) return error.getResponse();
	console.error(error);
	return c.text('Internal Server Error', 500);
}

/**
 * An `app.onError` handler: every `JanusError` answered with its status and
 * `bodyOf(error)`; anything else handed to `fallback` — Hono's own behaviour
 * when absent.
 *
 * Works for either side of `@nxgt/janus`: `can()`'s `STORE_FAILED` is a 503
 * here too, never a 403.
 */
export function janusErrors(
	fallback: ErrorHandler = honoDefault,
): ErrorHandler {
	return (error, c) =>
		error instanceof JanusError
			? c.json(bodyOf(error), statusOf(error.code))
			: fallback(error, c);
}
