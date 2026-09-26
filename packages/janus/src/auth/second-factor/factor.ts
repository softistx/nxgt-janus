import type { ResolvedConfig } from '../config';
import type { Context } from '../context';
import type { SecondFactorRecord, UserRecord } from '../port/types';
import { seal, unseal } from '../sealing';
import { fromBase32, matchStep } from '../totp';

/**
 * What the second factor's flows share: its configuration, its states, and
 * the one check of a code against a sealed secret.
 *
 * A factor is **enrolled** once `enroll` wrote it, **active** once a first
 * code confirmed it, and gone after `disable`. Only an active one is asked
 * for at sign-in.
 */

export type Settings = NonNullable<ResolvedConfig['secondFactor']>;

type ActiveFactor = SecondFactorRecord & { readonly confirmedAt: Date };

export const isActive = (
	factor: SecondFactorRecord | null,
): factor is ActiveFactor => factor !== null && factor.confirmedAt !== null;

/** The configuration, or a wiring refusal: no keys, no second factor. */
export function requireSettings(
	context: Context,
	where: string,
	why: string,
): Settings {
	const configured = context.config.secondFactor;
	if (configured === null) {
		throw new TypeError(
			`${where}: ${why}, and janus() was given no secondFactor — pass secondFactor: { issuer, keys }`,
		);
	}
	return configured;
}

/**
 * Checks a code against the user's secret. Answers the factor as it is to be
 * written — the step accepted, and the secret sealed again under the first
 * key when an older one sealed it — or `null` for a code that does not match,
 * or was already used.
 */
export function acceptCode(
	configured: Settings,
	record: UserRecord,
	factor: SecondFactorRecord,
	code: string,
	now: Date,
	where: string,
): SecondFactorRecord | null {
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
}
