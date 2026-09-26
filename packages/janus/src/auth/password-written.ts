import type { Id } from '../ids/id';
import type { ResolvedType } from './config';
import {
	type AnyUser,
	type Context,
	findRecord,
	passwordMatches,
} from './context';
import { burnOneTime } from './one-time';
import type { UserRecord } from './port/types';
import type { SignInResult } from './types';

/** The type's password rule, or a wiring refusal for a JavaScript caller. */
export function passwordRule(type: ResolvedType, where: string) {
	if (type.password === null) {
		throw new TypeError(
			`${where}: the ${type.name} type does not sign in with a password — add password: { login } to it`,
		);
	}
	return type.password;
}

/**
 * What writing a password ends besides: every second-factor challenge of the
 * user still open, so a sign-in started with the old password cannot be
 * finished. Called **after** the write — the other half of
 * {@link heldByPassword}, which reads **after** it issued.
 */
export async function endSignInsWaiting(
	context: Context,
	userId: Id,
): Promise<void> {
	await context.store.tokens.spendUserTokens(
		userId,
		'secondFactor',
		context.clock.now(),
	);
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
