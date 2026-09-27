/** Resolves the TOTP second factor: its issuer, its sealer, its challenge's lifespan. */

import { parseDuration } from '../../time/duration';
import { resolveSealer } from '../sealing';
import type { SecondFactorConfig } from './janus-config';
import type { ResolvedConfig } from './resolved-config';

export function resolveSecondFactor(
	config: SecondFactorConfig | undefined,
	where: string,
): ResolvedConfig['secondFactor'] {
	if (config === undefined) return null;
	const at = `${where}: secondFactor`;
	if (typeof config?.issuer !== 'string' || config.issuer.trim() === '') {
		throw new TypeError(
			`${at}.issuer must name your application — the authenticator app shows it beside the account`,
		);
	}
	return {
		issuer: config.issuer,
		sealer: resolveSealer(config.keys, `${at}.keys`),
		challengeTtlMs: parseDuration(config.challenge ?? '5m', `${at}.challenge`),
	};
}
