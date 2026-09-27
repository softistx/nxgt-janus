/**
 * The session cookie: its name, and the `Set-Cookie` values that set and
 * clear it, under the attributes the configuration resolved.
 */

import type { AnyUser, Context } from '../context';
import type { Session, SharedApi } from '../types';

export function cookieOf(context: Context): SharedApi<AnyUser>['cookie'] {
	const { name, domain, path, sameSite, secure } = context.config.cookie;
	const attributes = [
		`Path=${path}`,
		...(domain === null ? [] : [`Domain=${domain}`]),
		'HttpOnly',
		`SameSite=${sameSite[0]?.toUpperCase()}${sameSite.slice(1)}`,
		...(secure ? ['Secure'] : []),
	].join('; ');

	return {
		name,
		serialize: (token: string, session: Session) =>
			`${name}=${token}; Expires=${session.expiresAt.toUTCString()}; ${attributes}`,
		clear: () =>
			`${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; ${attributes}`,
	};
}
