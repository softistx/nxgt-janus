import type { At } from '../at';
import type { ResolvedType } from '../config';
import type { AnyUser, Context } from '../context';
import { deviceHint, reportNewDevice } from '../devices';
import { issueOneTime } from '../one-time';
import type { UserRecord } from '../port/types';
import { openSession } from '../sessions';
import { restartSignInCount } from '../sign-in-attempts';
import type { SecondFactorRequired, SignedIn, SignInOptions } from '../types';
import { acceptCode, requireSettings } from './factor';
import { openChallenge, refuseCode, spendChallenge } from './redeem';

/**
 * The challenge `signIn` answers instead of a session, and the code that
 * redeems it. **Only the challenge's hash is stored**, like a session
 * token's.
 */
export function challengeFlows(context: Context, type: ResolvedType, at: At) {
	return {
		async issue(
			record: UserRecord,
			where: string,
		): Promise<SecondFactorRequired> {
			const configured = requireSettings(
				context,
				where,
				"the user's second factor is active",
			);
			const { secret, expiresAt } = await issueOneTime(context, {
				kind: 'secondFactor',
				userId: record.id,
				// Nothing is sent for a challenge: there is no address.
				address: '',
				ttlMs: configured.challengeTtlMs,
			});
			return {
				status: 'secondFactor',
				challenge: secret,
				expiresAt,
				userId: record.id,
			};
		},

		async confirm(
			challenge: string,
			code: string,
			options?: SignInOptions,
		): Promise<SignedIn<AnyUser>> {
			return confirmChallenge(context, type, challenge, code, at, options);
		},
	};
}

/**
 * Redeems a challenge with its code: counted first, then refused for a user
 * gone, inactive or without a factor any more, then compared — and the factor
 * written under the version read before the session opens.
 */
async function confirmChallenge(
	context: Context,
	type: ResolvedType,
	challenge: string,
	code: string,
	at: At,
	options: SignInOptions | undefined,
): Promise<SignedIn<AnyUser>> {
	const where = at('secondFactor.confirm');
	const device = deviceHint(context, options, where);
	const opened = await openChallenge(context, type, challenge, where);
	const { record } = opened;

	const now = context.clock.now();
	const accepted = acceptCode(
		opened.configured,
		record,
		record.secondFactor,
		String(code),
		now,
		where,
	);
	if (accepted === null) return refuseCode(context, type, opened, where);

	// Read, decided, then written under the version read: of two codes
	// accepted at once, the second write is VERSION_CONFLICT.
	const written = await context.store.users.updateUser(
		record.id,
		{ secondFactor: accepted, updatedAt: now },
		record.version,
	);
	await spendChallenge(context, opened.secret, where);
	// The sign-in is complete: the password's count starts again.
	await restartSignInCount(context, type, written, where);
	const signedIn = await openSession(context, type, written, device);
	await reportNewDevice(context, signedIn);
	return signedIn;
}
