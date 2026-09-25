/**
 * `@nxgt/janus-telemetry` — `@nxgt/janus` on `@nxgt/telemetry`.
 *
 * - `instrumentJanus(auth)` — a span per flow, and the security events worth
 *   an audit trail: sign-ups, sign-ins and why one was refused, sign-outs,
 *   deleted and deactivated users, changed passwords;
 * - `instrumentPermissions(access)` — a span per `can` and `list`, and an event
 *   per tuple granted or revoked.
 *
 * A refusal is an answer, never a failed span; nothing written carries a
 * login, an e-mail, a password or a token.
 */

export { instrumentJanus } from './flows';
export { instrumentPermissions } from './permissions';
