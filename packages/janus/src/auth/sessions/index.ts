/**
 * Sessions: opening one (`open-session.ts`), reading the token a request
 * presents (`presented-token.ts`), authenticating it (`authenticate.ts`), the
 * cookie that carries it (`cookie.ts`), and everything `janus()` answers
 * whatever its user types (`shared-api.ts`).
 *
 * Gathered here from the files beside this one.
 */

export { openSession, toSession } from './open-session';
export { presentedToken } from './presented-token';
export { type InternalSharedApi, sharedApi } from './shared-api';
