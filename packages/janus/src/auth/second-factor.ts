import {
	SecondFactorError,
	TokenError,
	UserInactiveError,
} from '../errors/janus-error';
import type { ResolvedConfig, ResolvedType } from './config';
import {
	type AnyUser,
	type Context,
	findRecord,
	toUser,
	writeUser,
} from './context';
import type { SecondFactorRecord, UserRecord } from './port/types';
import { seal, unseal } from './sealing';
import { hashSecret, mintSecret } from './secrets';
import { openSession } from './sessions';
import { fromBase32, matchStep, mintTotpSecret, otpauthUri } from './totp';
import type {
	SecondFactorApi,
	SecondFactorRequired,
	SignedIn,
} from './types';

/**
 * How many codes one challenge takes. A six-digit code has a million values:
 * five tries is a one-in-200,000 chance per password guessed right, and the
 * attempts are counted by the store in one write, never read then written.
 */
export const CHALLENGE_ATTEMPTS = 5;

type Settings = NonNullable<ResolvedConfig['secondFactor']>;
type ActiveFactor = SecondFactorRecord & { readonly confirmedAt: Date };

const isActive = (factor: SecondFactorRecord | null): factor is ActiveFactor =>
	factor !== null && factor.confirmedAt !== null;

/**
 * The second factor of one user type: the flows its API answers, and the
 * challenge `signIn` issues instead of a session.
 */
export function secondFactorFlows(
	context: Context,
	type: ResolvedType,
	at: (operation: string) => string,
) {
	const { store, clock } = context;

	/** The configuration, or a wiring refusal: no keys, no second factor. */
	const settings = (where: string, why: string): Settings => {
		const configured = context.config.secondFactor;
		if (configured === null) {
			throw new TypeError(
				`${where}: ${why}, and janus() was given no secondFactor — pass secondFactor: { issuer, keys }`,
			);
		}
		return configured;
	};

	/** The login a user signs in with: the account name the app shows. */
	const accountOf = (record: UserRecord, where: string): string => {
		if (type.password === null) {
			throw new TypeError(
				`${where}: the ${type.name} type does not sign in with a password, so it has no second factor`,
			);
		}
		return String(record.fields[type.password.login]);
	};

	/**
	 * Checks a code against the user's secret. Answers the factor as it is to
	 * be written — the step accepted, and the secret sealed again under the
	 * first key when an older one sealed it — or `null` for a code that does
	 * not match, or was already used.
	 */
	const accept = (
		configured: Settings,
		record: UserRecord,
		factor: SecondFactorRecord,
		code: string,
		now: Date,
		where: string,
	): SecondFactorRecord | null => {
		const { plain, keyId } = unseal(
			configured.sealer,
			factor.secret,
			record.id,
			where,
		);
		const step = matchStep(fromBase32(plain), code, now, factor.lastStep);
		if (step === null) return null;
		return {
			...factor,
			lastStep: step,
			secret:
				keyId === configured.sealer.sealWith
					? factor.secret
					: seal(configured.sealer, plain, record.id),
		};
	};

	const codeInvalid = (where: string, userId: string, attemptsLeft?: number) =>
		new TokenError(
			'CODE_INVALID',
			`${where}: the code does not match, or was already used`,
			{
				operation: where,
				userId,
				userType: type.name,
				...(attemptsLeft === undefined ? {} : { attemptsLeft }),
			},
		);

	/** Spends a challenge, and refuses it if another call spent it first. */
	const spend = async (tokenHash: string, where: string): Promise<void> => {
		const spent = await store.tokens.consumeToken(
			tokenHash,
			'secondFactor',
			clock.now(),
		);
		if (spent === null) {
			throw new TokenError('TOKEN_UNKNOWN', `${where}: no such challenge`, {
				operation: where,
			});
		}
		if (spent.spentAt !== null) {
			throw new TokenError(
				'TOKEN_SPENT',
				`${where}: the challenge was already used`,
				{ operation: where },
			);
		}
	};

	const api: SecondFactorApi<AnyUser>['secondFactor'] = {
		async enroll(user, options) {
			const where = at('secondFactor.enroll');
			const configured = settings(where, 'a second factor is being enrolled');
			const secret = mintTotpSecret();

			const written = await writeUser(
				context,
				user,
				type,
				options,
				where,
				(record) => {
					if (isActive(record.secondFactor)) {
						throw new SecondFactorError(
							'SECOND_FACTOR_ACTIVE',
							`${where}: the user's second factor is active — disable it first`,
							{ operation: where, userId: record.id, userType: type.name },
						);
					}
					accountOf(record, where);
					return {
						secondFactor: {
							method: 'totp',
							secret: seal(configured.sealer, secret, record.id),
							confirmedAt: null,
							lastStep: null,
						},
					};
				},
			);

			return {
				secret,
				uri: otpauthUri(configured.issuer, accountOf(written, where), secret),
			};
		},

		async activate(user, code, options) {
			const where = at('secondFactor.activate');
			const configured = settings(where, 'a second factor is being activated');

			const written = await writeUser(
				context,
				user,
				type,
				options,
				where,
				(record, now) => {
					const factor = record.secondFactor;
					if (factor === null) {
						throw new SecondFactorError(
							'SECOND_FACTOR_NOT_ENROLLED',
							`${where}: the user has no second factor waiting — call enroll first`,
							{ operation: where, userId: record.id, userType: type.name },
						);
					}
					if (isActive(factor)) {
						throw new SecondFactorError(
							'SECOND_FACTOR_ACTIVE',
							`${where}: the user's second factor is already active`,
							{ operation: where, userId: record.id, userType: type.name },
						);
					}
					const accepted = accept(
						configured,
						record,
						factor,
						String(code),
						now,
						where,
					);
					if (accepted === null) throw codeInvalid(where, record.id);
					return { secondFactor: { ...accepted, confirmedAt: now } };
				},
			);
			return toUser(written);
		},

		async disable(user, options) {
			const where = at('secondFactor.disable');
			return toUser(
				await writeUser(context, user, type, options, where, () => ({
					secondFactor: null,
				})),
			);
		},

		async confirm(challenge, code) {
			const where = at('secondFactor.confirm');
			const configured = settings(where, 'a second factor is being confirmed');
			const tokenHash = hashSecret(String(challenge));

			// Counted before anything is checked, and in one write: a guess that
			// fails for any reason has still cost an attempt.
			const token = await store.tokens.countAttempt(tokenHash, 'secondFactor');
			if (token === null) {
				throw new TokenError('TOKEN_UNKNOWN', `${where}: no such challenge`, {
					operation: where,
				});
			}
			if (token.spentAt !== null) {
				throw new TokenError(
					'TOKEN_SPENT',
					`${where}: the challenge was already used`,
					{ operation: where },
				);
			}
			if (token.expiresAt.getTime() <= clock.now().getTime()) {
				throw new TokenError(
					'TOKEN_EXPIRED',
					`${where}: the challenge has expired — sign in again`,
					{ operation: where },
				);
			}

			const record = await findRecord(context, token.userId, type.name);
			if (record === null) {
				throw new TokenError('TOKEN_UNKNOWN', `${where}: no such challenge`, {
					operation: where,
				});
			}
			const attemptsLeft = Math.max(0, CHALLENGE_ATTEMPTS - token.attempts);
			if (token.attempts > CHALLENGE_ATTEMPTS) {
				// A call that raced the one that spent it: refused unread.
				throw codeInvalid(where, record.id, 0);
			}
			if (!record.active) {
				await spend(tokenHash, where);
				throw new UserInactiveError(`${where}: the user is inactive`, {
					userId: record.id,
					userType: type.name,
				});
			}

			// Read, decided, then written under the version read: of two codes
			// accepted at once, the second write is VERSION_CONFLICT.
			if (!isActive(record.secondFactor)) {
				await spend(tokenHash, where);
				throw new SecondFactorError(
					'SECOND_FACTOR_NOT_ENROLLED',
					`${where}: the user no longer has a second factor — sign in again`,
					{ operation: where, userId: record.id, userType: type.name },
				);
			}
			const now = clock.now();
			const accepted = accept(
				configured,
				record,
				record.secondFactor,
				String(code),
				now,
				where,
			);
			if (accepted === null) {
				// The last attempt, and a wrong code: the challenge is spent.
				if (attemptsLeft === 0) await spend(tokenHash, where);
				throw codeInvalid(where, record.id, attemptsLeft);
			}
			const written = await store.users.updateUser(
				record.id,
				{ secondFactor: accepted, updatedAt: now },
				record.version,
			);

			await spend(tokenHash, where);
			return openSession(context, type, written) as Promise<SignedIn<AnyUser>>;
		},
	};

	return {
		api,

		/**
		 * What `signIn` answers for a user whose factor is active: a challenge
		 * instead of a session. **Only the challenge's hash is stored**, like a
		 * session token's.
		 */
		async challenge(
			record: UserRecord,
			where: string,
		): Promise<SecondFactorRequired> {
			const configured = settings(where, "the user's second factor is active");
			const now = clock.now();
			const secret = mintSecret();
			const expiresAt = new Date(now.getTime() + configured.challengeTtlMs);

			await store.tokens.insertToken({
				tokenHash: hashSecret(secret),
				kind: 'secondFactor',
				userId: record.id,
				// Nothing is sent for a challenge: there is no address.
				address: '',
				codeHash: null,
				attempts: 0,
				expiresAt,
				spentAt: null,
				createdAt: now,
			});
			return { status: 'secondFactor', challenge: secret, expiresAt };
		},

		/** Whether `signIn` must ask for a code before opening a session. */
		required: (record: UserRecord): boolean => isActive(record.secondFactor),
	};
}
