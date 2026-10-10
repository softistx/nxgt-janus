import {
	JanusError,
	type JanusErrorCode,
	statusOf as janusStatusOf,
} from '@nxgt/janus';
import type { Context, ErrorHandler } from 'hono';
import type { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * The status each code deserves: `@nxgt/janus`'s own table, typed as the
 * `ContentfulStatusCode` `c.json()` takes. Kept as an export of its own so a
 * route that answers by hand reads the same status `janusErrors()` does.
 *
 * `STORE_FAILED` is 503 and nothing else — **an outage is not a negative
 * answer**, and a 401 or a 404 would tell every user they do not exist.
 */
export function statusOf(code: JanusErrorCode): ContentfulStatusCode {
	return janusStatusOf(code);
}

/**
 * The body a refusal is answered with: its `code`, and only what the client
 * can act on — the fields that failed the schema, the policy's minimum, the
 * attempts a challenge has left, the seconds a throttled sign-in or a
 * throttled request for an e-mail waits.
 * Never `reason`, `login`, a hash prefix or a cause: those are for your logs.
 */
export function bodyOf(error: JanusError): {
	readonly code: JanusErrorCode;
	readonly issues?: JanusError['issues'];
	readonly minLength?: number;
	readonly attemptsLeft?: number;
	readonly retryAfter?: number;
} {
	switch (error.code) {
		case 'USER_INVALID':
			return { code: error.code, issues: error.issues ?? [] };
		case 'PASSWORD_TOO_SHORT':
			return error.minLength === undefined
				? { code: error.code }
				: { code: error.code, minLength: error.minLength };
		case 'CODE_INVALID':
			return error.attemptsLeft === undefined
				? { code: error.code }
				: { code: error.code, attemptsLeft: error.attemptsLeft };
		case 'CREDENTIALS_INVALID':
		case 'MAIL_THROTTLED':
			return error.retryAfter === undefined
				? { code: error.code }
				: { code: error.code, retryAfter: error.retryAfter };
		default:
			return { code: error.code };
	}
}

/**
 * Hono's own answer to an error it was not told about, copied from its
 * default handler: the response of an `HTTPException` — merged with the
 * headers the route set before throwing — and a logged 500 for anything else.
 */
function honoDefault(error: Error | HTTPException, c: Context): Response {
	if ('getResponse' in error) {
		const response = error.getResponse();
		return c.newResponse(response.body, response);
	}
	console.error(error);
	return c.text('Internal Server Error', 500);
}

/** What `janusErrors()` takes. */
export interface JanusErrorsOptions {
	/**
	 * Called with every `JanusError` answered 5xx — `STORE_FAILED`,
	 * `UNSUPPORTED`, `PERMISSION_DEPTH`: the ones the server must fix, not the
	 * client — before it is answered. Its `slot`, `operation`, `reason` and
	 * `cause` are for your logs; the body never carries them.
	 *
	 * **It cannot stop the answer**: one that throws, or rejects, is a
	 * `process.emitWarning`, and the 503 is sent all the same.
	 */
	readonly report?: (error: JanusError, c: Context) => unknown;
	/** Every error that is not a `JanusError`. Hono's own handling when absent. */
	readonly fallback?: ErrorHandler;
}

/**
 * An `app.onError` handler: every `JanusError` answered with its status and
 * `bodyOf(error)` — and a throttled sign-in, or a request past its e-mails
 * (`MAIL_THROTTLED`, 429), with a `Retry-After` header, its `retryAfter` in
 * seconds; anything else handed to `fallback` — Hono's own
 * behaviour when absent.
 *
 * Works for either side of `@nxgt/janus`: `can()`'s `STORE_FAILED` is a 503
 * here too, never a 403.
 *
 * ```ts
 * app.onError(janusErrors({ report: (error) => logger.error(error) }));
 * ```
 */
export function janusErrors(options: JanusErrorsOptions = {}): ErrorHandler {
	const { report, fallback = honoDefault } = options;
	return (error, c) => {
		if (!(error instanceof JanusError)) return fallback(error, c);
		const status = statusOf(error.code);
		if (status >= 500 && report !== undefined) reportSafely(report, error, c);
		const headers =
			error.retryAfter === undefined
				? undefined
				: { 'retry-after': String(error.retryAfter) };
		return c.json(bodyOf(error), status, headers);
	};
}

/** `report`, whose own failure is a warning — never a lost answer. */
function reportSafely(
	report: NonNullable<JanusErrorsOptions['report']>,
	error: JanusError,
	c: Context,
): void {
	const warn = (failure: unknown) =>
		process.emitWarning(
			`janusErrors: report failed on ${error.code}: ${failure instanceof Error ? failure.name : typeof failure}`,
		);
	try {
		// A thenable of any make, as a native promise: its rejection warns too.
		Promise.resolve(report(error, c)).then(undefined, warn);
	} catch (failure) {
		warn(failure);
	}
}
