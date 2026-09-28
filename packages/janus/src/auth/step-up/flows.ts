/**
 * A step-up: a signed-in user proving again who they are before a sensitive
 * action, with a code sent by e-mail — or from their app, when their second
 * factor is active — and **the session they are on stamped as freshly
 * confirmed**. It opens no session: its `authenticatedAt` moves, which is
 * what a route checks with `assertFresh`.
 *
 * The same six digits, challenge and five attempts as a sign-in code, on a
 * token kind of its own: a sign-in code never confirms an action, nor an
 * action's code signs anyone in.
 */

import { TokenError } from '../../errors/janus-error';
import type { At } from '../at';
import type { ResolvedType } from '../config';
import type { AnyUser, Context } from '../context';
import { countCodeAttempt } from '../one-time';
import { toSession } from '../sessions/open-session';
import type { RequestLike, Session, StepUpApi } from '../types';
import { checkAppCode, checkEmailedCode } from './codes';
import { openStepUp } from './open';
import { type IssuedStepUp, requestStepUp } from './request';

/** The step-up of one user type. */
export function stepUpFlows(
	context: Context,
	type: ResolvedType,
	at: At,
): StepUpApi<AnyUser, IssuedStepUp>['stepUp'] {
	return {
		async request(user) {
			return requestStepUp(context, type, user, at('stepUp.request'));
		},

		async confirm(request, challenge, code) {
			return confirmStepUp(
				context,
				type,
				request,
				String(challenge),
				String(code),
				at('stepUp.confirm'),
			);
		},
	};
}

/**
 * Counts the attempt first — a guess that fails for any reason has still
 * cost one — then reads the session and the user, checks the code, and
 * stamps the session.
 */
async function confirmStepUp(
	context: Context,
	type: ResolvedType,
	request: RequestLike,
	secret: string,
	code: string,
	where: string,
): Promise<Session> {
	const { token, attemptsLeft } = await countCodeAttempt(
		context,
		secret,
		'stepUp',
		where,
		type.name,
	);
	const { session, user } = await openStepUp(
		context,
		type,
		request,
		token,
		secret,
		where,
	);

	const counted = { token, secret, attemptsLeft };
	// No code hash: the challenge was issued for the user's app.
	if (token.codeHash === null) {
		await checkAppCode(context, type, user, counted, code, where);
	} else {
		await checkEmailedCode(context, type, user, counted, code, where);
	}

	const confirmed = await context.store.sessions.reauthenticateSession(
		session.id,
		context.clock.now(),
	);
	// Revoked while the code was checked: signed out, and never brought back.
	if (confirmed === null) {
		throw new TokenError(
			'TOKEN_UNKNOWN',
			`${where}: the session was signed out while the code was checked`,
			{ operation: where },
		);
	}
	return toSession(confirmed);
}
