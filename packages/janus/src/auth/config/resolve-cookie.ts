/** Resolves the session cookie: the strict defaults, and a name browsers take. */

import type { CookieConfig } from './janus-config';
import type { ResolvedConfig } from './resolved-config';

/** RFC 6265's cookie-name token: no control character, space, or separator. */
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function resolveCookie(
	cookie: CookieConfig,
	where: string,
): ResolvedConfig['cookie'] {
	const name = cookie.name ?? 'janus-session';
	if (!COOKIE_NAME.test(name)) {
		throw new TypeError(
			`${where}: cookie.name must be a cookie-name token — letters, digits and !#$%&'*+-.^_\`|~, with no space, ";" or "="`,
		);
	}
	const sameSite = cookie.sameSite ?? 'lax';
	const secure = cookie.secure ?? true;
	if (sameSite === 'none' && !secure) {
		throw new TypeError(
			`${where}: cookie.sameSite "none" requires cookie.secure — browsers refuse the cookie otherwise`,
		);
	}

	return {
		name,
		domain: cookie.domain ?? null,
		path: cookie.path ?? '/',
		sameSite,
		secure,
	};
}
