import { JanusError } from './base';
import type { JanusErrorCode } from './codes';
import type { JanusErrorOptions } from './options';

/** The fields failed the user type's schema. */
export class UserInvalidError extends JanusError {
	override name = 'UserInvalidError';
	override readonly code = 'USER_INVALID' as const;
}

/** A password too short, credentials that do not match, or a hash format nobody reads. */
export class CredentialError extends JanusError {
	override name = 'CredentialError';
	override readonly code: JanusErrorCode;

	constructor(
		code: Extract<
			JanusErrorCode,
			'PASSWORD_TOO_SHORT' | 'CREDENTIALS_INVALID' | 'HASH_UNSUPPORTED'
		>,
		message: string,
		options?: JanusErrorOptions,
	) {
		super(message, options);
		this.code = code;
	}
}

/** The user is inactive, and the password given was the right one. */
export class UserInactiveError extends JanusError {
	override name = 'UserInactiveError';
	override readonly code = 'USER_INACTIVE' as const;
}

/**
 * A one-time token that is unknown, already spent, lapsed, or sent to an
 * e-mail the user no longer has — or a one-time code that does not match.
 */
export class TokenError extends JanusError {
	override name = 'TokenError';
	override readonly code: JanusErrorCode;

	constructor(
		code: Extract<
			JanusErrorCode,
			| 'TOKEN_UNKNOWN'
			| 'TOKEN_SPENT'
			| 'TOKEN_EXPIRED'
			| 'TOKEN_STALE'
			| 'CODE_INVALID'
		>,
		message: string,
		options?: JanusErrorOptions,
	) {
		super(message, options);
		this.code = code;
	}
}

/** A second factor asked to change from a state it is not in. */
export class SecondFactorError extends JanusError {
	override name = 'SecondFactorError';
	override readonly code: JanusErrorCode;

	constructor(
		code: Extract<
			JanusErrorCode,
			'SECOND_FACTOR_NOT_ENROLLED' | 'SECOND_FACTOR_ACTIVE'
		>,
		message: string,
		options?: JanusErrorOptions,
	) {
		super(message, options);
		this.code = code;
	}
}

/**
 * The session proved who it is longer ago than the action asks: confirm it
 * with a step-up, then send the request again.
 */
export class StepUpRequiredError extends JanusError {
	override name = 'StepUpRequiredError';
	override readonly code = 'STEP_UP_REQUIRED' as const;
}

/** A cursor this store did not mint, or one for another ordering. */
export class InvalidCursorError extends JanusError {
	override name = 'InvalidCursorError';
	override readonly code = 'INVALID_CURSOR' as const;
}

/** The wired store does not implement the optional capability asked for. */
export class UnsupportedError extends JanusError {
	override name = 'UnsupportedError';
	override readonly code = 'UNSUPPORTED' as const;
}

/** A permission check walked deeper than `maxDepth` without an answer. */
export class PermissionDepthError extends JanusError {
	override name = 'PermissionDepthError';
	override readonly code = 'PERMISSION_DEPTH' as const;
}
