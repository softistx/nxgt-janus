/**
 * Resolves the two `{ throttle }` options, which take the same shape and
 * differ in their defaults: `signIn.throttle`, ten passwords per login per
 * fifteen minutes, and `mail.throttle`, five requests per flow, per address
 * or user, per fifteen minutes. Each is on unless `false`.
 */

import { type Duration, parseDuration } from '../../time/duration';
import type { ResolvedConfig } from './resolved-config';

/** A throttle once resolved, or `null` when it is `false`. */
type ResolvedThrottle = ResolvedConfig['signInThrottle'];

/** What either option takes: `{ throttle }`, a limit or `false`. */
interface ThrottleOption {
	readonly throttle?:
		| { readonly attempts?: number; readonly window?: Duration }
		| false;
}

/** The defaults of one option, and the name a refusal gives it. */
interface Defaults {
	readonly option: 'signIn' | 'mail';
	readonly attempts: number;
	readonly window: Duration;
}

/** Resolves `signIn.throttle`: on unless `false`, ten passwords per login per fifteen minutes. */
export function resolveSignInThrottle(
	config: ThrottleOption | undefined,
	where: string,
): ResolvedThrottle {
	return resolveThrottle(
		config,
		{ option: 'signIn', attempts: 10, window: '15m' },
		where,
	);
}

/**
 * Resolves `mail.throttle`: on unless `false`, five requests per flow, per
 * address or user, per fifteen minutes — a sign-in link's lifetime, room for
 * a visitor who asks again, and a loop held to twenty e-mails an hour.
 */
export function resolveMailThrottle(
	config: ThrottleOption | undefined,
	where: string,
): ResolvedThrottle {
	return resolveThrottle(
		config,
		{ option: 'mail', attempts: 5, window: '15m' },
		where,
	);
}

function resolveThrottle(
	config: ThrottleOption | undefined,
	defaults: Defaults,
	where: string,
): ResolvedThrottle {
	const { option } = defaults;
	if (config !== undefined && (typeof config !== 'object' || config === null)) {
		throw new TypeError(`${where}: ${option} must be an object — { throttle }`);
	}
	const throttle = config?.throttle ?? {};
	if (throttle === false) return null;
	const at = `${where}: ${option}.throttle`;
	if (typeof throttle !== 'object' || throttle === null) {
		throw new TypeError(
			`${at} must be { attempts, window }, or false to count nothing`,
		);
	}
	const attempts = throttle.attempts ?? defaults.attempts;
	if (!Number.isSafeInteger(attempts) || attempts < 1) {
		throw new TypeError(`${at}.attempts must be a whole number above zero`);
	}
	return {
		attempts,
		windowMs: parseDuration(throttle.window ?? defaults.window, `${at}.window`),
	};
}
