import { SecondFactorError, UserInactiveError } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import { type AnyUser, type Context, findRecord } from '../context';
import {
	burnOneTime,
	CODE_ATTEMPTS,
	issueOneTime,
	refuseUnusable,
	spendOneTime,
	unknownOneTime,
} from '../one-time';
import type { UserRecord } from '../port/types';
import { hashSecret } from '../secrets';
import { openSession } from '../sessions';
import type { SecondFactorRequired, SignedIn } from '../types';
import { acceptCode, codeInvalid, isActive, requireSettings } from './factor';

/**
 * The challenge `signIn` answers instead of a session, and the code that
 * redeems it. **Only the challenge's hash is stored**, like a session
 * token's.
 */
export function challengeFlows(
	context: Context,
	type: ResolvedType,
	at: (operation: string) => string,
) {
	const { store, clock } = context;
	const spend = (challenge: string, where: string) =>
		spendOneTime(context, challenge, 'secondFactor', where, 'challenge');

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
			return { status: 'secondFactor', challenge: secret, expiresAt };
		},

		async confirm(challenge: string, code: string): Promise<SignedIn<AnyUser>> {
			const where = at('secondFactor.confirm');
			const configured = requireSettings(
				context,
				where,
				'a second factor is being confirmed',
			);
			const secret = String(challenge);

			// Counted before anything is checked, and in one write: a guess that
			// fails for any reason has still cost an attempt.
			const token = await store.tokens.countAttempt(
				hashSecret(secret),
				'secondFactor',
			);
			refuseUnusable(token, clock.now(), where, 'challenge');
			if (token.attempts > CODE_ATTEMPTS) {
				// A call that raced the one that spent it: refused unread.
				throw codeInvalid(type, where, token.userId, 0);
			}
			const attemptsLeft = CODE_ATTEMPTS - token.attempts;

			// A user gone since, or of another type, is as good as no challenge.
			const record = await findRecord(context, token.userId, type.name);
			if (record === null) throw unknownOneTime(where, 'challenge');
			if (!record.active) {
				await spend(secret, where);
				throw new UserInactiveError(`${where}: the user is inactive`, {
					userId: record.id,
					userType: type.name,
				});
			}
			if (!isActive(record.secondFactor)) {
				await spend(secret, where);
				throw new SecondFactorError(
					'SECOND_FACTOR_NOT_ENROLLED',
					`${where}: the user no longer has a second factor — sign in again`,
					{ operation: where, userId: record.id, userType: type.name },
				);
			}

			const now = clock.now();
			const accepted = acceptCode(
				configured,
				record,
				record.secondFactor,
				String(code),
				now,
				where,
			);
			if (accepted === null) {
				// The last attempt, and a wrong code: the challenge is spent.
				if (attemptsLeft === 0) {
					await burnOneTime(context, secret, 'secondFactor');
				}
				throw codeInvalid(type, where, record.id, attemptsLeft);
			}

			// Read, decided, then written under the version read: of two codes
			// accepted at once, the second write is VERSION_CONFLICT.
			const written = await store.users.updateUser(
				record.id,
				{ secondFactor: accepted, updatedAt: now },
				record.version,
			);
			await spend(secret, where);
			return openSession(context, type, written);
		},
	};
}
