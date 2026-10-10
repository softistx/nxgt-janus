/**
 * Issuing a step-up: a challenge for the user, with a code to e-mail, or to
 * confirm with their app when their second factor is active.
 */

import { NotFoundError, UserInactiveError } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	emailOf,
	getRecord,
	idOf,
	toUser,
} from '../context';
import { countMailByUser } from '../mail-requests';
import { issueCode, issueOneTime } from '../one-time';
import type { UserRecord } from '../port/types';
import { isActive, requireSettings } from '../second-factor/factor';
import { hashSecret } from '../secrets';
import type { StepUpByApp, StepUpByEmail, UserRef } from '../types';

/** What `stepUp.request` answers, whatever the type's configuration. */
export type IssuedStepUp = StepUpByEmail<AnyUser> | StepUpByApp<AnyUser>;

/** Issues a step-up for the user, and spends every other they had. */
export async function requestStepUp(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	where: string,
): Promise<IssuedStepUp> {
	const record = await getRecord(context, idOf(user), type.name, where);
	if (!record.active) {
		throw new UserInactiveError(`${where}: the user is inactive`, {
			userId: record.id,
			userType: type.name,
		});
	}

	const issued = isActive(record.secondFactor)
		? await byApp(context, record, where)
		: await byEmail(context, type, record, where);
	// One live step-up per user, as for a sign-in code: issued first, the
	// others spent after, so requests that race leave at most one.
	await context.store.tokens.spendUserTokens(
		record.id,
		'stepUp',
		context.clock.now(),
		hashSecret(issued.challenge),
	);
	return issued;
}

/** A challenge the user's app confirms: nothing is sent, so there is no address. */
async function byApp(
	context: Context,
	record: UserRecord,
	where: string,
): Promise<StepUpByApp<AnyUser>> {
	requireSettings(context, where, "the user's second factor is active");
	const { secret, expiresAt } = await issueOneTime(context, {
		kind: 'stepUp',
		userId: record.id,
		address: '',
		ttlMs: context.config.tokenTtlMs.stepUp,
	});
	return {
		via: 'secondFactor',
		challenge: secret,
		expiresAt,
		user: toUser(record),
	};
}

/** A challenge with a six-digit code, for the user's current e-mail. */
async function byEmail(
	context: Context,
	type: ResolvedType,
	record: UserRecord,
	where: string,
): Promise<StepUpByEmail<AnyUser>> {
	const email = emailOf(type, record.fields);
	if (email === null) {
		throw new NotFoundError(`${where}: the user has no e-mail`, {
			userId: record.id,
			userType: type.name,
			operation: where,
		});
	}
	// Counted per user, and only when a code is e-mailed: an app's challenge
	// sends nothing.
	await countMailByUser(context, type, 'stepUp', record.id, where);
	const { secret, code, expiresAt } = await issueCode(context, {
		kind: 'stepUp',
		userId: record.id,
		address: email,
		ttlMs: context.config.tokenTtlMs.stepUp,
	});
	return {
		via: 'email',
		code,
		challenge: secret,
		email,
		expiresAt,
		user: toUser(record),
	};
}
