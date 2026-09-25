import { createLogger, event, type TelemetryEvent } from '@nxgt/telemetry';
import { type Fields, fieldsOf, idOf, traced, typeOf } from './traced';

const log = createLogger('@nxgt/janus');

/** The audit trail of who was given what: one event per tuple written. */
const granted = event('janus.tuple.granted');
const revoked = event('janus.tuple.revoked');

/** A subject — a user, an object, or a subject set — as fields. */
function subjectFields(subject: unknown): Fields {
	const relation =
		typeof subject === 'object' && subject !== null && 'relation' in subject
			? subject.relation
			: undefined;
	return fieldsOf({
		'janus.subject.type': typeOf(subject),
		'janus.subject.id': idOf(subject),
		'janus.subject.relation':
			typeof relation === 'string' ? relation : undefined,
	});
}

function objectFields(object: unknown): Fields {
	return fieldsOf({
		'janus.object.type': typeOf(object),
		'janus.object.id': idOf(object),
	});
}

type Traced = (...args: unknown[]) => Promise<unknown>;

/** How each method of `permissions()` is traced. */
const TRACERS: Readonly<Record<string, (fn: Traced) => Traced>> = {
	can:
		(fn) =>
		(...args) =>
			traced(
				'janus.can',
				fieldsOf({
					...subjectFields(args[0]),
					'janus.permission': typeof args[1] === 'string' ? args[1] : undefined,
					...objectFields(args[2]),
				}),
				() => fn(...args),
				(scope, outcome) => {
					if (outcome.ok)
						scope.attribute('janus.allowed', outcome.value === true);
				},
			),
	list:
		(fn) =>
		(...args) =>
			traced(
				'janus.list',
				fieldsOf({
					...subjectFields(args[0]),
					'janus.permission': typeof args[1] === 'string' ? args[1] : undefined,
					'janus.object.type':
						typeof args[2] === 'string' ? args[2] : undefined,
				}),
				() => fn(...args),
				(scope, outcome) => {
					const page = outcome.ok ? outcome.value : undefined;
					if (typeof page === 'object' && page !== null && 'items' in page) {
						const items = page.items;
						if (Array.isArray(items))
							scope.attribute('janus.page.items', items.length);
					}
				},
			),
	grant: (fn) => tupleWrite('janus.grant', granted, fn),
	revoke: (fn) => tupleWrite('janus.revoke', revoked, fn),
};

function tupleWrite(
	name: string,
	written: (fields: Fields) => TelemetryEvent,
	fn: Traced,
): Traced {
	return (...args) => {
		const fields = fieldsOf({
			...objectFields(args[0]),
			'janus.relation': typeof args[1] === 'string' ? args[1] : undefined,
			...subjectFields(args[2]),
		});
		return traced(
			name,
			fields,
			() => fn(...args),
			(_scope, outcome) => {
				if (outcome.ok) log.info(written(fields));
			},
		);
	};
}

/**
 * The same `permissions()` instance, traced: a span per `can` — its subject,
 * permission, object and whether it was allowed — and per `list`, and a
 * `janus.tuple.granted` or `janus.tuple.revoked` event for every tuple
 * written, the audit trail of who was given what.
 *
 * ```ts
 * const access = instrumentPermissions(permissions({ model, store }));
 * ```
 *
 * A denial is an answer, not a failure: `janus.allowed` is `false` and the
 * span is `ok`. A relation store that cannot answer fails the span.
 */
export function instrumentPermissions<A extends object>(access: A): A {
	// `permissions()` answers a frozen object, which a Proxy may not answer
	// differently for: the traced methods go on a copy, frozen in turn.
	const copy: Record<string, unknown> = Object.fromEntries(
		Object.entries(access),
	);
	for (const [key, tracer] of Object.entries(TRACERS)) {
		const method: unknown = copy[key];
		if (typeof method !== 'function') continue;
		copy[key] = tracer((...args) =>
			Promise.resolve(method.apply(access, args)),
		);
	}
	return Object.freeze(copy) as A;
}
