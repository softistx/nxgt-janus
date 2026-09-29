import type { JanusError } from '@nxgt/janus';
import { type Fields, fieldsOf, idOf, typeOf } from '../traced';
import type { Call } from './call';

/** The user an answer names — `{ user }` or the user itself — as fields. */
export function userFields(call: Call, value: unknown): Fields {
	const user =
		typeof value === 'object' && value !== null && 'user' in value
			? value.user
			: value;
	return fieldsOf({
		'janus.user.type': typeOf(user) ?? call.userType,
		'user.id': idOf(user),
	});
}

/**
 * A session opened: the user, and `janus.signIn.newDevice` when the answer
 * says the device was new to them — never the device token itself.
 */
export function signedInFields(call: Call, value: unknown): Fields {
	const newDevice =
		typeof value === 'object' &&
		value !== null &&
		'newDevice' in value &&
		value.newDevice === true;
	return {
		...userFields(call, value),
		...(newDevice ? { 'janus.signIn.newDevice': true } : {}),
	};
}

/** Whose sign-in waits for a code: the `userId` the answer carries. */
export function secondFactorFields(call: Call, value: unknown): Fields {
	const userId =
		typeof value === 'object' && value !== null && 'userId' in value
			? value.userId
			: undefined;
	return fieldsOf({
		'janus.user.type': call.userType,
		'user.id': typeof userId === 'string' ? userId : undefined,
	});
}

/** The user a flow was called for: its first argument. */
export function argumentUser(call: Call): Fields {
	return fieldsOf({
		'janus.user.type': call.userType,
		'user.id': idOf(call.args[0]),
	});
}

/**
 * Why a sign-in was refused: the code, the reason, the user when one holds
 * the login, and what a challenge has left of its attempts.
 */
export function refusalFields(call: Call, refusal: JanusError): Fields {
	return fieldsOf({
		'janus.user.type': refusal.userType ?? call.userType,
		'janus.refusal': refusal.code,
		'janus.refusal.reason': refusal.reason,
		'janus.secondFactor.attemptsLeft': refusal.attemptsLeft,
		'user.id': refusal.userId,
	});
}

/** `signIn`'s `status`, when the answer has one. */
export function statusOf(value: unknown): string | undefined {
	return typeof value === 'object' &&
		value !== null &&
		'status' in value &&
		typeof value.status === 'string'
		? value.status
		: undefined;
}

/** How many recovery codes `secondFactor.recover` left: a count, never a code. */
export function recoveryCodesLeft(value: unknown): number | undefined {
	return typeof value === 'object' &&
		value !== null &&
		'recoveryCodesLeft' in value &&
		typeof value.recoveryCodesLeft === 'number'
		? value.recoveryCodesLeft
		: undefined;
}

/**
 * The user a session names — what `stepUp.confirm` answers — by its
 * `userId`: the session's own id is not the user's.
 */
export function sessionUserFields(call: Call, value: unknown): Fields {
	const userId =
		typeof value === 'object' && value !== null && 'userId' in value
			? value.userId
			: undefined;
	return fieldsOf({
		'janus.user.type': call.userType,
		'user.id': typeof userId === 'string' ? userId : undefined,
	});
}

/** How a step-up is confirmed — `email` or `secondFactor` — when the answer says. */
export function viaOf(value: unknown): string | undefined {
	return typeof value === 'object' &&
		value !== null &&
		'via' in value &&
		typeof value.via === 'string'
		? value.via
		: undefined;
}
