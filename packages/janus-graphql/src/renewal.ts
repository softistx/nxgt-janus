/**
 * The renewed session cookie: `authenticate` renews a sliding session in
 * passing, and `useJanus()` sends it again on the HTTP response — as
 * `@nxgt/janus-hono`'s `session()` does — through Yoga's `onResponse`.
 */

import type { Session } from '@nxgt/janus';
import { answerOf } from './context';

/** The part of `auth.cookie` a renewal needs. */
export interface SessionCookie {
	readonly name: string;
	serialize(token: string, session: Session): string;
}

/** What Yoga hands `onResponse`: the part of it read here. */
export interface ResponsePayload {
	readonly request: Request;
	readonly response: Response;
}

/**
 * The contexts built for each HTTP request: one, or one per operation of a
 * batched request. A `WeakMap`, so an answered request takes its entry with
 * it.
 */
const contexts = new WeakMap<object, object[]>();

/** Remembers `janus` as a context built for `request`. */
export function track(request: object, janus: object): void {
	const known = contexts.get(request);
	if (known === undefined) contexts.set(request, [janus]);
	else known.push(janus);
}

/**
 * Sends the session cookie again when a context of `request` renewed it —
 * only when `authenticate` ran for it, so an operation that asked nothing
 * costs nothing here. As `session()` in `@nxgt/janus-hono`, only to a
 * request that presented the token as the session cookie — a client that sent
 * `Authorization: Bearer` or `X-Session-Token` is not handed a cookie it never
 * asked for — and never over a session cookie the response already sets.
 *
 * A failed `authenticate` sends nothing: its error is the response's.
 */
export async function resendRenewed(
	{ request, response }: ResponsePayload,
	cookie: SessionCookie | undefined,
): Promise<void> {
	const known = contexts.get(request);
	if (cookie === undefined || known === undefined) return;
	for (const janus of known) {
		const current = await answerOf(janus)?.then(
			(answer) => answer,
			() => null,
		);
		if (
			current?.renewed === true &&
			cookieOf(request, cookie.name) === current.token &&
			!sets(response, cookie.name)
		) {
			response.headers.append(
				'Set-Cookie',
				cookie.serialize(current.token, current.session),
			);
		}
	}
}

/** The value of the cookie `name` the request sent, or `null`. */
function cookieOf(request: Request, name: string): string | null {
	const header = request.headers.get('cookie');
	if (header === null) return null;
	for (const pair of header.split(';')) {
		const at = pair.indexOf('=');
		if (at !== -1 && pair.slice(0, at).trim() === name) {
			return pair.slice(at + 1).trim();
		}
	}
	return null;
}

/** Whether the response already sets the cookie `name`. */
function sets(response: Response, name: string): boolean {
	return response.headers
		.getSetCookie()
		.some((value) => value.startsWith(`${name}=`));
}
