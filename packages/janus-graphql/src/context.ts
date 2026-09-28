/**
 * `ctx.janus`, built once per request by `useJanus()`: a lazy
 * authentication, and the per-request check `can()` and the directives ask
 * through.
 */

import type { Authenticated, RequestLike } from '@nxgt/janus';
import type { JanusOnContext } from './types';

/** One check, as `access.can` answers it — loose: the typing is the caller's. */
export type Check = (
	subject: { readonly type: string; readonly id: string } | null,
	permission: string,
	object: { readonly type: string; readonly id: string },
	options?: { readonly ctx?: unknown },
) => Promise<boolean>;

/** A user as this module reads one: the part every user type has. */
type AnyUser = { readonly type: string; readonly id: string };

type LooseAuth = {
	authenticate(
		request: RequestLike,
		options?: { readonly type?: string },
	): Promise<Authenticated<AnyUser> | null>;
};

type Built = JanusOnContext<AnyUser, unknown>;

/**
 * The check of each context this module built. A `WeakMap` rather than a
 * property, so the context's own surface stays `user`, `session` and
 * `access`; it is the one place a request's checks pass through, and so the
 * one place a per-request memo of their answers goes.
 */
const checks = new WeakMap<object, Check>();

/** What `createJanusContext` reads from `useJanus()`'s options. */
export interface ContextOptions {
	readonly auth: LooseAuth;
	readonly access?: { readonly can: unknown } | undefined;
	readonly type?: string | undefined;
}

/**
 * `ctx.janus` for one request. `authenticate` runs the first time `user()`
 * or `session()` is asked, once, and its answer — or its failure — is the
 * answer of both from then on.
 *
 * A context with no request — a transport that is not HTTP — answers a
 * `TypeError` from `user()`, not `null`: anonymous is an answer, and nothing
 * here asked.
 */
export function createJanusContext(
	request: RequestLike | undefined,
	options: ContextOptions,
): Built {
	const { auth, access, type } = options;
	let answer: Promise<Authenticated<AnyUser> | null>;
	let asked = false;
	const authenticated = () => {
		if (!asked) {
			asked = true;
			answer =
				request === undefined
					? Promise.reject(
							new TypeError(
								'useJanus(): the GraphQL context has no request to authenticate — build the context from an HTTP request',
							),
						)
					: auth.authenticate(
							request,
							type === undefined ? undefined : { type },
						);
		}
		return answer;
	};

	const janus = Object.freeze({
		user: () => authenticated().then((current) => current?.user ?? null),
		session: () => authenticated().then((current) => current?.session ?? null),
		...(access === undefined ? {} : { access }),
	});
	if (access !== undefined) checks.set(janus, access.can as Check);
	return janus as Built;
}

/**
 * The check `ctx.janus` answers through: the one its context was built
 * with, or `access.can` for a context built by hand. `null` when it has no
 * `access` at all.
 */
export function checkOf(janus: object): Check | null {
	const built = checks.get(janus);
	if (built !== undefined) return built;
	const access = (janus as { readonly access?: { readonly can?: unknown } })
		.access;
	return typeof access?.can === 'function' ? (access.can as Check) : null;
}

/**
 * `ctx.janus`, or a wiring `TypeError` naming `caller` when nothing put it
 * there: `useJanus()` is missing from the plugins.
 */
export function janusOf(ctx: unknown, caller: string): Built {
	const janus = (ctx as { readonly janus?: Built } | null)?.janus;
	if (janus === undefined || typeof janus.user !== 'function') {
		throw new TypeError(
			`${caller}: ctx.janus is not set — add useJanus({ auth }) to the plugins`,
		);
	}
	return janus;
}
