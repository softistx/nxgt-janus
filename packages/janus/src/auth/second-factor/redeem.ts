import { SecondFactorError, UserInactiveError } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import { type Context, findRecord } from '../context';
import {
	burnOneTime,
	codeInvalid,
	countCodeAttempt,
	spendOneTime,
	unknownChallenge,
} from '../one-time';
import type { SecondFactorRecord, UserRecord } from '../port/types';
import { isActive, requireSettings, type Settings } from './factor';

/**
 * What redeeming `signIn`'s challenge takes before any code is compared —
 * with an app's code (`confirm`) or a recovery code (`recover`): the attempt
 * counted, then the user read, and refused when gone, inactive or without an
 * active factor any more.
 */

/** A challenge counted, and the user it waits for, whose factor is active. */
export interface OpenedChallenge {
	readonly configured: Settings;
	readonly secret: string;
	readonly attemptsLeft: number;
	readonly record: UserRecord & {
		readonly secondFactor: SecondFactorRecord & { readonly confirmedAt: Date };
	};
}

/** Spends a second-factor challenge, refusing it when this call did not. */
export const spendChallenge = (
	context: Context,
	challenge: string,
	where: string,
) => spendOneTime(context, challenge, 'secondFactor', where, 'challenge');

/**
 * Counts one attempt at the challenge, then reads its user: refused for a
 * user gone, of another type, inactive, or whose factor was disabled since.
 */
export async function openChallenge(
	context: Context,
	type: ResolvedType,
	challenge: string,
	where: string,
): Promise<OpenedChallenge> {
	const configured = requireSettings(
		context,
		where,
		'a second factor is being confirmed',
	);
	const secret = String(challenge);

	const { token, attemptsLeft } = await countCodeAttempt(
		context,
		secret,
		'secondFactor',
		where,
		type.name,
	);

	// A user gone since, or of another type, is as good as no challenge.
	const record = await findRecord(context, token.userId, type.name);
	if (record === null) {
		throw await unknownChallenge(context, token, secret, where);
	}
	if (!record.active) {
		await spendChallenge(context, secret, where);
		throw new UserInactiveError(`${where}: the user is inactive`, {
			userId: record.id,
			userType: type.name,
		});
	}
	const factor = record.secondFactor;
	if (!isActive(factor)) {
		await spendChallenge(context, secret, where);
		throw new SecondFactorError(
			'SECOND_FACTOR_NOT_ENROLLED',
			`${where}: the user no longer has a second factor — sign in again`,
			{ operation: where, userId: record.id, userType: type.name },
		);
	}
	return {
		configured,
		secret,
		attemptsLeft,
		record: { ...record, secondFactor: factor },
	};
}

/** A code that does not match: on the last attempt, the challenge is spent. */
export async function refuseCode(
	context: Context,
	type: ResolvedType,
	opened: OpenedChallenge,
	where: string,
): Promise<never> {
	if (opened.attemptsLeft === 0) {
		await burnOneTime(context, opened.secret, 'secondFactor');
	}
	throw codeInvalid(where, opened.record.id, type.name, opened.attemptsLeft);
}
