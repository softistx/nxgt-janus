import { JanusError, type JanusErrorCode } from '@nxgt/janus';
import { type SpanScope, span } from '@nxgt/telemetry';

/**
 * The codes the **server** must fix. Every other `JanusError` is a refusal —
 * a wrong password, a taken login, a spent token — which is an answer, not a
 * failure: its span stays `ok`.
 */
const FAILURES: ReadonlySet<JanusErrorCode> = new Set<JanusErrorCode>([
	'STORE_FAILED',
	'UNSUPPORTED',
	'PERMISSION_DEPTH',
	'HASH_UNSUPPORTED',
]);

/** A `JanusError` the caller caused; anything else, or a failure code, is not. */
export function isRefusal(error: unknown): error is JanusError {
	return error instanceof JanusError && !FAILURES.has(error.code);
}

/** What a span or an event carries: scalars only, and never an absent one. */
export type Fields = Readonly<Record<string, string | number | boolean>>;

/** `fields` without its `undefined` values. */
export function fieldsOf(
	fields: Readonly<Record<string, string | number | boolean | undefined>>,
): Fields {
	const kept: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) kept[key] = value;
	}
	return kept;
}

/** The `id` of a user reference, a subject or an object — or nothing. */
export function idOf(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (typeof value === 'object' && value !== null && 'id' in value) {
		const id: unknown = value.id;
		if (typeof id === 'string') return id;
	}
	return undefined;
}

/** The `type` of a subject or an object — or nothing. */
export function typeOf(value: unknown): string | undefined {
	if (typeof value === 'object' && value !== null && 'type' in value) {
		const type: unknown = value.type;
		if (typeof type === 'string') return type;
	}
	return undefined;
}

/** How a traced call ended, for what is written after it. */
export type Outcome =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly refusal: JanusError };

/**
 * Runs `call` in a span. **A refusal is an answer**: the span ends `ok`, with
 * `janus.refusal` set to its code, and the error is rethrown once the span is
 * over. A failure is rethrown inside it, so the span is `error`, with the
 * store slot and operation a `StoreFailure` names.
 *
 * `after` sees the outcome inside the span. It reads, and writes signals —
 * which never throw — so it cannot turn an answer into a failure.
 */
export async function traced<T>(
	name: string,
	fields: Fields,
	call: () => Promise<T>,
	after: (scope: SpanScope, outcome: Outcome) => void,
): Promise<T> {
	const ended = await span(name, { attributes: fields }, async (scope) => {
		try {
			const value = await call();
			after(scope, { ok: true, value });
			return { ok: true as const, value };
		} catch (error) {
			if (error instanceof JanusError) {
				scope.attribute('janus.error.code', error.code);
				if (error.slot !== undefined)
					scope.attribute('janus.store.slot', error.slot);
				if (error.operation !== undefined) {
					scope.attribute('janus.store.operation', error.operation);
				}
			}
			if (!isRefusal(error)) throw error;
			scope.attribute('janus.refusal', error.code);
			after(scope, { ok: false, refusal: error });
			return { ok: false as const, refusal: error };
		}
	});
	if (!ended.ok) throw ended.refusal;
	return ended.value;
}
