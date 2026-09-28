import { traceObject } from './trace';

/** What `janus()` answers, as far as it is read: its user types and its flows. */
export interface JanusLike {
	readonly types: readonly string[];
	readonly authenticate: (...args: never[]) => Promise<unknown>;
}

/**
 * The same `janus()` instance, with every flow traced — a span per call,
 * named `janus.signIn` or `janus.patient.signIn` — and the events a security
 * review reads written as logs: sign-ups, sign-ins and the reason one was
 * refused, a second factor asked for, enrolled, activated or disabled, a
 * sign-in by recovery code and the codes left, recovery codes regenerated,
 * sign-outs, deleted and deactivated users, changed passwords.
 *
 * ```ts
 * const auth = instrumentJanus(janus({ users, store, hasher }));
 * ```
 *
 * **A refusal is an answer**: a wrong password leaves its span `ok`, with
 * `janus.refusal` set, and is a `janus.signIn.refused` warning — never a
 * failed span. A store that cannot answer is one, with `janus.store.slot`.
 *
 * Nothing written carries a login, an e-mail, a password, a token, a
 * challenge, a code, a TOTP secret or a session id: user types, user ids,
 * codes and reasons only.
 */
export function instrumentJanus<A extends JanusLike>(auth: A): A {
	const types = auth.types.filter((type) => typeof type === 'string');
	const only = types.length === 1 ? types[0] : undefined;
	return traceObject(auth, [], (path) =>
		path[0] !== undefined && types.includes(path[0])
			? { userType: path[0], flow: path.slice(1) }
			: { userType: only, flow: path },
	);
}
