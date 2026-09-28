/**
 * What confirming a step-up takes before any code is compared: the session
 * the request presents, and the user the challenge is for — the two the
 * same, both standing.
 */

import { UserInactiveError } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import { type Context, findRecord } from '../context';
import { spendOneTime, unknownChallenge } from '../one-time';
import type { SessionRecord, TokenRecord, UserRecord } from '../port/types';
import { standingSession } from '../sessions/standing';
import type { RequestLike } from '../types';

/** The session a step-up confirms, and its user. */
export interface OpenedStepUp {
	readonly session: SessionRecord;
	readonly user: UserRecord;
}

/**
 * Reads the session the request presents and the user the challenge is for.
 * A session absent, revoked, lapsed, or another user's is as good as no
 * challenge — a challenge is confirmed on its user's own session, never on
 * somebody else's — and so is a user gone since, or of another type. Each
 * attempt was counted before, so the last one spends the challenge.
 */
export async function openStepUp(
	context: Context,
	type: ResolvedType,
	request: RequestLike,
	token: TokenRecord,
	secret: string,
	where: string,
): Promise<OpenedStepUp> {
	const session = (await standingSession(context, request))?.session ?? null;
	if (session === null || session.userId !== token.userId) {
		throw await unknownChallenge(context, token, secret, where);
	}

	const user = await findRecord(context, token.userId, type.name);
	if (user === null) {
		throw await unknownChallenge(context, token, secret, where);
	}
	if (!user.active) {
		await spendOneTime(context, secret, 'stepUp', where, 'challenge');
		throw new UserInactiveError(`${where}: the user is inactive`, {
			userId: user.id,
			userType: type.name,
		});
	}
	return { session, user };
}
