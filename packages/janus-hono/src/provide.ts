import type { MiddlewareHandler } from 'hono';

/** What `provide()` takes: the `janus()` instance, the `permissions()` one, or both. */
export interface Instances {
	readonly auth?: object;
	readonly access?: object;
}

/**
 * The middleware that puts the instances on the context — `c.var.auth`, and
 * `c.var.access` — so a route writes users and tuples through them rather
 * than through a module import: `c.var.access.grant(record, 'owner', user)`.
 *
 * Only what is passed is set, and typed.
 */
export function provide<const I extends Instances>(
	instances: I,
): MiddlewareHandler<{
	// biome-ignore lint/style/useNamingConvention: Hono's `Env` names the key, not us.
	Variables: { [K in keyof I & keyof Instances]: I[K] };
}> {
	return async (c, next) => {
		if (instances.auth !== undefined) c.set('auth', instances.auth);
		if (instances.access !== undefined) c.set('access', instances.access);
		await next();
	};
}
