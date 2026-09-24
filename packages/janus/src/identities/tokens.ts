import { NotFoundError, TokenError } from '../errors/janus-error';
import { type Context, getRecord, toIdentity, writeIdentity } from './context';
import type { TokenKind, TokenRecord, VerifiableAddress } from './port/types';
import { hashSecret, mintSecret } from './secrets';
import type { Identities } from './types';

export function tokensOf(context: Context): Identities<unknown>['tokens'] {
	const { stores, clock, config } = context;

	/**
	 * Spends a token and says why it cannot be used, when it cannot.
	 *
	 * The store answers the token **as it was before the call**: `spentAt: null`
	 * means this call spent it, and exactly one call ever sees that. A lapsed
	 * token is spent all the same, so it cannot be retried.
	 */
	const redeem = async (
		kind: TokenKind,
		secret: string,
		where: string,
	): Promise<TokenRecord> => {
		const now = clock.now();
		const token = await stores.tokens.consumeToken(
			hashSecret(secret),
			kind,
			now,
		);

		// None of these messages names the token: it is a secret, and so is
		// its hash.
		if (token === null) {
			throw new TokenError('TOKEN_UNKNOWN', `${where}: no such token`, {
				operation: where,
			});
		}
		if (token.spentAt !== null) {
			throw new TokenError(
				'TOKEN_SPENT',
				`${where}: the token was already used`,
				{
					operation: where,
				},
			);
		}
		if (token.expiresAt.getTime() <= now.getTime()) {
			throw new TokenError('TOKEN_EXPIRED', `${where}: the token has expired`, {
				operation: where,
			});
		}

		return token;
	};

	return {
		async issue(kind, identityId, address) {
			const from =
				kind === 'verification' ? config.verificationFrom : config.recoveryFrom;
			if (from === null) {
				throw new TypeError(
					`tokens.issue: the definition declares no ${kind} — add ${kind}: { from } to defineIdentities`,
				);
			}

			const identity = await getRecord(context, identityId, 'tokens.issue');
			if (!identity.addresses.some((held) => held.value === address)) {
				throw new NotFoundError(
					'tokens.issue: the identity holds no such address',
					{ identityId: identity.id, operation: 'tokens.issue' },
				);
			}

			const now = clock.now();
			const secret = mintSecret();
			const expiresAt = new Date(now.getTime() + config.tokenTtlMs[kind]);

			await stores.tokens.insertToken({
				tokenHash: hashSecret(secret),
				kind,
				identityId: identity.id,
				address,
				expiresAt,
				spentAt: null,
				createdAt: now,
			});

			return { secret, expiresAt };
		},

		async consumeVerification(secret) {
			const token = await redeem(
				'verification',
				secret,
				'tokens.consumeVerification',
			);

			return writeIdentity(
				context,
				token.identityId,
				undefined,
				'tokens.consumeVerification',
				(record, now) => ({
					addresses: verifiedAddresses(
						record?.addresses ?? [],
						token.address,
						true,
						now,
						token.identityId,
						'tokens.consumeVerification',
					),
				}),
				true,
			);
		},

		async consumeRecovery(secret) {
			const token = await redeem('recovery', secret, 'tokens.consumeRecovery');
			const identity = await getRecord(
				context,
				token.identityId,
				'tokens.consumeRecovery',
			);
			// No session is opened here: what a recovered account may do next is
			// the application's policy, and a core that minted one would have
			// decided it.
			return toIdentity(identity);
		},
	};
}

/**
 * The addresses, with one of them — **addressed by value** — verified or not.
 * `verified` and `verifiedAt` move together, in one write.
 */
export function verifiedAddresses(
	addresses: readonly VerifiableAddress[],
	address: string,
	verified: boolean,
	now: Date,
	identityId: string,
	where: string,
): VerifiableAddress[] {
	if (!addresses.some((held) => held.value === address)) {
		throw new NotFoundError(`${where}: the identity holds no such address`, {
			identityId,
			operation: where,
		});
	}

	return addresses.map((held) =>
		held.value === address
			? { ...held, verified, verifiedAt: verified ? now : null }
			: held,
	);
}
