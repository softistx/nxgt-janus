/**
 * Every refusal as a `GraphQLError` whose `extensions` carry a `code` and the
 * HTTP status Yoga answers with: `{ code, http: { status } }`. This package
 * defines no error class of its own — a denial is a `GraphQLError`, and what
 * `@nxgt/janus` throws stays its own until `janusMaskError()` reads it.
 */

import { JanusError, type JanusErrorStatus, statusOf } from '@nxgt/janus';
import { GraphQLError } from 'graphql';
import { reporting } from './report';

/** What a guard answers without asking `@nxgt/janus`: no user, or not this one. */
export type DenialCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND';

/** A denial: `UNAUTHENTICATED` 401, `FORBIDDEN` 403 or `NOT_FOUND` 404. */
export function denial(code: DenialCode, message?: string): GraphQLError {
	const [status, fallback] = denialOf(code);
	return new GraphQLError(message ?? fallback, {
		extensions: { code, http: { status } },
	});
}

function denialOf(code: DenialCode): readonly [number, string] {
	switch (code) {
		case 'UNAUTHENTICATED':
			return [401, 'Not signed in'];
		case 'FORBIDDEN':
			return [403, 'Forbidden'];
		case 'NOT_FOUND':
			return [404, 'Not found'];
	}
}

/**
 * A `JanusError` as the client may read it: its code and status, and only
 * what the client can act on — `issues`, `minLength`, `attemptsLeft`,
 * `retryAfter`. Never `reason`, `login`, `slot` or a cause: those are for
 * your logs. A throttled sign-in also carries its `Retry-After` header in
 * `http.headers`, which Yoga answers with.
 *
 * `STORE_FAILED` is `SERVICE_UNAVAILABLE` 503 — **an outage is never a
 * denial** — and no message of the core's reaches the client.
 */
export function janusGraphQLError(error: JanusError): GraphQLError {
	const status = statusOf(error.code);
	const code =
		error.code === 'STORE_FAILED' ? 'SERVICE_UNAVAILABLE' : error.code;
	return new GraphQLError(messageOf(status), {
		originalError: error,
		extensions: { code, http: httpOf(error, status), ...actionable(error) },
	});
}

/**
 * A fixed message per status: the core's own message names a hash prefix or
 * a version, which are for your logs. The client reads `extensions.code`.
 */
function messageOf(status: JanusErrorStatus): string {
	switch (status) {
		case 400:
			return 'Invalid request';
		case 401:
			return 'Invalid credentials';
		case 403:
			return 'Forbidden';
		case 404:
			return 'Not found';
		case 409:
			return 'Conflict';
		case 503:
			return 'The service is unavailable, retry later';
		case 500:
		case 501:
			return 'Internal server error';
	}
}

/** The status, and the `Retry-After` of a throttled sign-in. */
function httpOf(
	error: JanusError,
	status: JanusErrorStatus,
): Record<string, unknown> {
	return error.retryAfter === undefined
		? { status }
		: { status, headers: { 'Retry-After': String(error.retryAfter) } };
}

/** The fields of a refusal a client can act on, as `@nxgt/janus-hono`'s `bodyOf`. */
function actionable(error: JanusError): Record<string, unknown> {
	switch (error.code) {
		case 'USER_INVALID':
			return { issues: error.issues ?? [] };
		case 'PASSWORD_TOO_SHORT':
			return error.minLength === undefined
				? {}
				: { minLength: error.minLength };
		case 'CODE_INVALID':
			return error.attemptsLeft === undefined
				? {}
				: { attemptsLeft: error.attemptsLeft };
		case 'CREDENTIALS_INVALID':
			return error.retryAfter === undefined
				? {}
				: { retryAfter: error.retryAfter };
		default:
			return {};
	}
}

/**
 * A rejection handler: a `JanusError` becomes its `GraphQLError`, anything
 * else goes on as it is. `.then(undefined, rethrown)`.
 */
export function rethrown(error: unknown): never {
	throw error instanceof JanusError ? janusGraphQLError(error) : error;
}

/** Yoga's and envelop's `maskError` signature. */
export type MaskError = (
	error: unknown,
	message: string,
	isDev?: boolean,
) => Error;

/** What `janusMaskError()` takes. */
export interface JanusMaskErrorOptions {
	/**
	 * Called once with every `JanusError` answered 5xx — `STORE_FAILED`,
	 * `UNSUPPORTED`, `PERMISSION_DEPTH` — whichever path it took: a
	 * directive, `requireUser()`, `can()`, or a resolver that let it through.
	 * Its `slot`, `operation`, `reason` and cause are for your logs; the
	 * response never carries them.
	 *
	 * **It cannot change the answer**: one that throws, or rejects, is a
	 * `process.emitWarning`, and the 503 is sent all the same.
	 */
	readonly report?: (error: JanusError) => unknown;
	/** Every error that is not a `JanusError`; see `janusMaskError()`. */
	readonly fallback?: MaskError;
}

/**
 * Yoga's `maskedErrors.maskError`: a `JanusError` a resolver let through is
 * answered with its code and status — `STORE_FAILED` as 503, never masked
 * into a 500 and never a denial — and every other error goes to `fallback`.
 *
 * Without a `fallback`, a `GraphQLError` is kept and anything else becomes
 * `message`, with no detail. Pass Yoga's own `maskError` to keep its
 * development-mode details — as the options' `fallback`, or alone, as
 * before `report` existed:
 *
 * ```ts
 * import { createYoga, maskError } from 'graphql-yoga';
 * createYoga({
 *   schema,
 *   plugins,
 *   maskedErrors: {
 *     maskError: janusMaskError({ report: (error) => logger.error(error), fallback: maskError }),
 *   },
 * });
 * ```
 */
export function janusMaskError(
	options: JanusMaskErrorOptions | MaskError = {},
): MaskError {
	const { report, fallback = masked } =
		typeof options === 'function' ? { fallback: options } : options;
	const reported = report === undefined ? undefined : reporting(report);
	return (error, message, isDev) => {
		reported?.(error);
		const original =
			error instanceof GraphQLError ? error.originalError : error;
		if (original instanceof JanusError) {
			const answer = janusGraphQLError(original);
			return error instanceof GraphQLError
				? new GraphQLError(answer.message, {
						nodes: error.nodes ?? null,
						path: error.path ?? null,
						originalError: original,
						extensions: answer.extensions,
					})
				: answer;
		}
		return fallback(error, message, isDev);
	};
}

/** The default `fallback`: a `GraphQLError` of our own kept, anything else `message`. */
function masked(error: unknown, message: string): Error {
	if (error instanceof GraphQLError) {
		const original = error.originalError;
		if (original === undefined || original instanceof GraphQLError) {
			return error;
		}
		return new GraphQLError(message, {
			nodes: error.nodes ?? null,
			path: error.path ?? null,
			extensions: { code: 'INTERNAL_SERVER_ERROR' },
		});
	}
	return new GraphQLError(message, {
		extensions: { code: 'INTERNAL_SERVER_ERROR' },
	});
}
