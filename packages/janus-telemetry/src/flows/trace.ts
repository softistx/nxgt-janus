import type { SpanScope } from '@nxgt/telemetry';
import { fieldsOf, type Outcome, traced } from '../traced';
import type { Call } from './call';
import { WRITTEN } from './events';
import { statusOf, userFields } from './fields';

/** What a span learns from an answer: whose it is, never what it holds. */
function answered(scope: SpanScope, call: Call, outcome: Outcome): void {
	if (outcome.ok) {
		const fields = userFields(call, outcome.value);
		for (const [key, value] of Object.entries(fields))
			scope.attribute(key, value);
		const value = outcome.value;
		if (typeof value === 'object' && value !== null && 'renewed' in value) {
			scope.attribute('janus.session.renewed', value.renewed === true);
		}
		const status =
			call.flow === 'signIn' || call.flow === 'signInCode.confirm'
				? statusOf(value)
				: undefined;
		if (status !== undefined) scope.attribute('janus.signIn.status', status);
	}
	WRITTEN[call.flow]?.(call, outcome);
}

/** `cookie` answers synchronously: it is the one part of `janus()` not traced. */
const UNTRACED = new Set(['cookie']);

/** Which user type and flow a path names: `['patient', 'signIn']`. */
type Split = (path: readonly string[]) => {
	readonly userType: string | undefined;
	readonly flow: readonly string[];
};

/**
 * A traced copy of `target`, frozen: its functions traced, its plain objects —
 * a user type's flows, `verifyEmail` — copied the same way. A copy rather
 * than a Proxy, which may not answer differently for a frozen property.
 */
export function traceObject<O extends object>(
	target: O,
	path: readonly string[],
	split: Split,
): O {
	const copy: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(target)) {
		if (UNTRACED.has(key)) {
			copy[key] = value;
		} else if (typeof value === 'function') {
			copy[key] = traceFunction(
				value as (...args: unknown[]) => unknown,
				target,
				[...path, key],
				split,
			);
		} else if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value)
		) {
			copy[key] = traceObject(value, [...path, key], split);
		} else {
			copy[key] = value;
		}
	}
	return Object.freeze(copy) as O;
}

function traceFunction(
	fn: (...args: unknown[]) => unknown,
	self: object,
	path: readonly string[],
	split: Split,
): (...args: unknown[]) => Promise<unknown> {
	const { userType, flow } = split(path);
	const name = `janus.${path.join('.')}`;
	const fields = fieldsOf({ 'janus.user.type': userType });
	return (...args) => {
		const call: Call = { flow: flow.join('.'), userType, args };
		return traced(
			name,
			fields,
			() => Promise.resolve(fn.apply(self, args)),
			(scope, outcome) => answered(scope, call, outcome),
		);
	};
}
