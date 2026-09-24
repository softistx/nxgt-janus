/**
 * `@nxgt/janus-hono` — `@nxgt/janus` in a Hono app.
 *
 * - `session(auth, options?)` — middleware: `c.var.user` and `c.var.session`
 *   on every request, a 401 where a user is required, the renewed cookie sent
 *   again;
 * - `sendSession(c, auth, signedIn)` and `signOut(c, auth)` — the cookie, set
 *   and cleared;
 * - `permission(access, permission, type, load)` — middleware: the route runs
 *   only if the subject holds the permission on the object `load` answers,
 *   and gets that object as `c.var.object`;
 * - `provide({ auth, access })` — the instances on the context, for a route
 *   that writes users or tuples;
 * - `janusErrors(fallback?)` — `app.onError`: every `JanusError` as its status,
 *   `STORE_FAILED` as 503 and never as 401 or 403.
 *
 * It defines no error class: what it lets through is `@nxgt/janus`'s own.
 */

export { bodyOf, janusErrors, statusOf } from './errors';
export {
	type ObjectData,
	type PermissionOptions,
	permission,
} from './permission';
export { type Instances, provide } from './provide';
export {
	type SessionEnv,
	type SessionOptions,
	sendSession,
	session,
	signOut,
	type UserOfAuth,
} from './session';
