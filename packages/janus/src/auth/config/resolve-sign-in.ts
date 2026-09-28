/** Resolves `signIn.throttle`: on unless `false`, ten passwords per login per fifteen minutes. */

import { parseDuration } from '../../time/duration';
import type { SignInConfig } from './janus-config';
import type { ResolvedConfig } from './resolved-config';

export function resolveSignInThrottle(
	config: SignInConfig | undefined,
	where: string,
): ResolvedConfig['signInThrottle'] {
	if (config !== undefined && (typeof config !== 'object' || config === null)) {
		throw new TypeError(`${where}: signIn must be an object — { throttle }`);
	}
	const throttle = config?.throttle ?? {};
	if (throttle === false) return null;
	const at = `${where}: signIn.throttle`;
	if (typeof throttle !== 'object' || throttle === null) {
		throw new TypeError(
			`${at} must be { attempts, window }, or false to count nothing`,
		);
	}
	const attempts = throttle.attempts ?? 10;
	if (!Number.isSafeInteger(attempts) || attempts < 1) {
		throw new TypeError(`${at}.attempts must be a whole number above zero`);
	}
	return {
		attempts,
		windowMs: parseDuration(throttle.window ?? '15m', `${at}.window`),
	};
}
