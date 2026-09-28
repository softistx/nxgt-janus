import type { Id } from '../ids/id';
import type { ResolvedType } from './config';
import {
	type AnyUser,
	type Context,
	findRecord,
	passwordMatches,
} from './context';
import { emit } from './events';
import { burnOneTime } from './one-time';
import type { UserRecord } from './port/types';
import type { SignInResult } from './types';

/**
 * What writing a password ends besides. A reset, a change and a set each call
 * it **after** the write, and a failure here throws — it is never ignored:
 *
 * - The user's reset links still unspent. A link answers a request to
 *   replace the password; once it is replaced, an older link would replace
 *   it again, without knowing the new one.
 * - Every second-factor challenge still open, so a sign-in started with the
 *   old password cannot be finished — the other half of
 *   {@link heldByPassword}, which reads **after** it issued.
 *
 * Both spends are attempted even when one fails, so a store failing one kind
 * still spends the other; the first failure is then thrown.
 *
 * After the write, not before: a link issued while the password is written
 * is spent too, where one issued between an earlier spend and the write
 * would survive. So an outage here leaves the password written and the
 * older links live, and the caller is told, with `STORE_FAILED`; the next
 * `resetPassword.request` spends them. Sign-in codes and step-ups are left
 * alone: the password proves neither, and a step-up belongs to a session,
 * which a reset revokes.
 */
export async function endWhatThePasswordOpened(
	context: Context,
	userId: Id,
): Promise<void> {
	const now = context.clock.now();
	const spent = await Promise.allSettled(
		(['resetPassword', 'secondFactor'] as const).map((kind) =>
			context.store.tokens.spendUserTokens(userId, kind, now),
		),
	);
	const failed = spent.find(
		(result): result is PromiseRejectedResult => result.status === 'rejected',
	);
	if (failed !== undefined) throw failed.reason;
}

/**
 * What a change and a set do once the password is written: end what the
 * old one opened, then send `user.passwordChanged` — from a `finally`, so an
 * outage ending them still reports the write, which a retry would not make
 * again. A reset sends `user.passwordReset` instead, from its own flow.
 */
export async function passwordChanged(
	context: Context,
	written: UserRecord,
): Promise<void> {
	try {
		await endWhatThePasswordOpened(context, written.id);
	} finally {
		await emit(context, 'user.passwordChanged', written, written.updatedAt);
	}
}

/**
 * Whether the password a sign-in verified is still the user's, once the
 * sign-in answered. A password written meanwhile ends the sign-in: its
 * session is revoked, or its challenge spent, and `false` is answered.
 *
 * A password writer writes, then spends the challenges waiting; a sign-in
 * issues, then reads here. Whichever order they interleave in, one of the two
 * sees the other. A hash that changed with the same password — a concurrent
 * sign-in rehashing it — is not a change: the password is compared again.
 */
export async function heldByPassword(
	context: Context,
	type: ResolvedType,
	verified: UserRecord,
	password: string,
	result: SignInResult<AnyUser>,
	where: string,
): Promise<boolean> {
	const now = await findRecord(context, verified.id, type.name);
	const kept =
		now !== null &&
		now.password !== null &&
		(now.password.hash === verified.password?.hash ||
			(await passwordMatches(context, now, password, where)));
	if (kept) return true;

	if (result.status === 'signedIn') {
		await context.store.sessions.revokeSession(
			result.session.id,
			context.clock.now(),
		);
	} else {
		await burnOneTime(context, result.challenge, 'secondFactor');
	}
	return false;
}
