/**
 * `janusMaskError({ report })`: every `JanusError` answered 5xx, handed to
 * the application's logger before the response goes — the directives' and
 * the helpers' included, which reach the mask already a `GraphQLError`.
 */

import { JanusError, statusOf } from '@nxgt/janus';
import { GraphQLError } from 'graphql';

/**
 * The `JanusError` behind `error`: itself, or the one a chain of
 * `GraphQLError`s carries as `originalError` — a directive's refusal,
 * located again by graphql-js. `null` when there is none.
 */
export function janusErrorIn(error: unknown): JanusError | null {
	let current = error;
	while (current instanceof GraphQLError) current = current.originalError;
	return current instanceof JanusError ? current : null;
}

/**
 * A `report` that sees each failure once — a lazy `authenticate` shared by
 * two guarded fields fails both with one error — and only a 5xx: an outage,
 * `UNSUPPORTED`, `PERMISSION_DEPTH`, the ones the server must fix.
 *
 * **It cannot change the answer**: one that throws, or rejects, is a
 * `process.emitWarning`, and the response is sent all the same.
 */
export function reporting(
	report: (error: JanusError) => unknown,
): (error: unknown) => void {
	const seen = new WeakSet<JanusError>();
	return (error) => {
		const janusError = janusErrorIn(error);
		if (janusError === null || seen.has(janusError)) return;
		if (statusOf(janusError.code) < 500) return;
		seen.add(janusError);
		const warn = (failure: unknown) =>
			process.emitWarning(
				`janusMaskError: report failed on ${janusError.code}: ${failure instanceof Error ? failure.name : typeof failure}`,
			);
		try {
			const reported = report(janusError);
			if (reported instanceof Promise) reported.then(undefined, warn);
		} catch (failure) {
			warn(failure);
		}
	};
}
