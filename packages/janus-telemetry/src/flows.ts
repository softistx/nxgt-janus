import type { JanusError } from '@nxgt/janus';
import { createLogger, event, type SpanScope } from '@nxgt/telemetry';
import {
	type Fields,
	fieldsOf,
	idOf,
	type Outcome,
	traced,
	typeOf,
} from './traced';

const log = createLogger('@nxgt/janus');

/** The events a security review reads: who signed in, out, up, and what changed. */
const events = {
	signedUp: event('janus.signUp'),
	signedIn: event('janus.signIn'),
	signInRefused: event('janus.signIn.refused'),
	signedOut: event('janus.signOut'),
	signedOutEverywhere: event('janus.signOutEverywhere'),
	userDeleted: event('janus.user.deleted'),
	userActivated: event('janus.user.activated'),
	userDeactivated: event('janus.user.deactivated'),
	passwordChanged: event('janus.password.changed'),
	passwordSet: event('janus.password.set'),
	passwordReset: event('janus.password.reset'),
	emailVerified: event('janus.email.verified'),
};

/** One call of a flow, as the events read it. */
interface Call {
	/** `signIn`, `verifyEmail.confirm`: the flow without the user type. */
	readonly flow: string;
	readonly userType: string | undefined;
	readonly args: readonly unknown[];
}

/**
 * What each flow writes once it answered. Nothing here reads a login, an
 * e-mail, a password or a token: only user types, ids, codes and reasons.
 */
const WRITTEN: Readonly<
	Record<string, (call: Call, outcome: Outcome) => void>
> = {
	signUp: (call, outcome) => {
		if (outcome.ok) log.info(events.signedUp(userFields(call, outcome.value)));
	},
	signIn: (call, outcome) => {
		if (outcome.ok) {
			log.info(events.signedIn(userFields(call, outcome.value)));
		} else {
			log.warn(events.signInRefused(refusalFields(call, outcome.refusal)));
		}
	},
	signOut: (_call, outcome) => {
		if (outcome.ok && outcome.value === true) log.info(events.signedOut());
	},
	signOutEverywhere: (call, outcome) => {
		if (outcome.ok) log.info(events.signedOutEverywhere(argumentUser(call)));
	},
	delete: (call, outcome) => {
		if (outcome.ok && outcome.value === true) {
			log.info(events.userDeleted(argumentUser(call)));
		}
	},
	setActive: (call, outcome) => {
		if (!outcome.ok) return;
		const written =
			call.args[1] === true ? events.userActivated : events.userDeactivated;
		log.info(written(argumentUser(call)));
	},
	changePassword: (call, outcome) => {
		if (outcome.ok) log.info(events.passwordChanged(argumentUser(call)));
	},
	setPassword: (call, outcome) => {
		if (outcome.ok) log.info(events.passwordSet(argumentUser(call)));
	},
	'resetPassword.confirm': (call, outcome) => {
		if (outcome.ok)
			log.info(events.passwordReset(userFields(call, outcome.value)));
	},
	'verifyEmail.confirm': (call, outcome) => {
		if (outcome.ok)
			log.info(events.emailVerified(userFields(call, outcome.value)));
	},
};

/** The user an answer names — `{ user }` or the user itself — as fields. */
function userFields(call: Call, value: unknown): Fields {
	const user =
		typeof value === 'object' && value !== null && 'user' in value
			? value.user
			: value;
	return fieldsOf({
		'janus.user.type': typeOf(user) ?? call.userType,
		'user.id': idOf(user),
	});
}

/** The user a flow was called for: its first argument. */
function argumentUser(call: Call): Fields {
	return fieldsOf({
		'janus.user.type': call.userType,
		'user.id': idOf(call.args[0]),
	});
}

/** Why a sign-in was refused: the code, the reason, and the user when one holds the login. */
function refusalFields(call: Call, refusal: JanusError): Fields {
	return fieldsOf({
		'janus.user.type': refusal.userType ?? call.userType,
		'janus.refusal': refusal.code,
		'janus.refusal.reason': refusal.reason,
		'user.id': refusal.userId,
	});
}

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
	}
	WRITTEN[call.flow]?.(call, outcome);
}

/** `cookie` answers synchronously: it is the one part of `janus()` not traced. */
const UNTRACED = new Set(['cookie']);

/**
 * The same `janus()` instance, with every flow traced — a span per call,
 * named `janus.signIn` or `janus.patient.signIn` — and the events a security
 * review reads written as logs: sign-ups, sign-ins and the reason one was
 * refused, sign-outs, deleted and deactivated users, changed passwords.
 *
 * ```ts
 * const auth = instrumentJanus(janus({ users, store, hasher }));
 * ```
 *
 * **A refusal is an answer**: a wrong password leaves its span `ok`, with
 * `janus.refusal` set, and is a `janus.signIn.refused` warning — never a
 * failed span. A store that cannot answer is one, with `janus.store.slot`.
 *
 * Nothing written carries a login, an e-mail, a password, a token or a
 * session id: user types, user ids, codes and reasons only.
 */
export function instrumentJanus<A extends object>(auth: A): A {
	const types = typesOf(auth);
	const only = types.length === 1 ? types[0] : undefined;
	return traceObject(auth, [], (path) =>
		path[0] !== undefined && types.includes(path[0])
			? { userType: path[0], flow: path.slice(1) }
			: { userType: only, flow: path },
	);
}

function typesOf(auth: object): readonly string[] {
	const types: unknown = (auth as { readonly types?: unknown }).types;
	return Array.isArray(types)
		? types.filter((type): type is string => typeof type === 'string')
		: [];
}

type Split = (path: readonly string[]) => {
	readonly userType: string | undefined;
	readonly flow: readonly string[];
};

/**
 * A traced copy of `target`, frozen: its functions traced, its plain objects —
 * a user type's flows, `verifyEmail` — copied the same way. A copy rather
 * than a Proxy, which may not answer differently for a frozen property.
 */
function traceObject<O extends object>(
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
