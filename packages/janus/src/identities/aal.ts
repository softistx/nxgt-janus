import { SessionError } from '../errors/janus-error';
import type { AuthenticatorAssuranceLevel } from './port/types';
import type { Session } from './types';

const RANK: Record<AuthenticatorAssuranceLevel, number> = { aal1: 1, aal2: 2 };

/**
 * Refuses a session below the assurance level a call requires. Synchronous.
 *
 * The field and the refusal exist; the step-up does not. That is exactly the
 * state of the parc — `totp` and `lookup_secret` configured, the level read and
 * shown, and no step-up flow — and building one is the application's.
 */
export function requireAal(
	session: Pick<Session, 'aal'>,
	level: AuthenticatorAssuranceLevel,
): void {
	if (RANK[session.aal] < RANK[level]) {
		throw new SessionError(
			'AAL_REQUIRED',
			`requireAal: this call requires ${level}, and the session holds ${session.aal}`,
			{ requiredAal: level },
		);
	}
}
