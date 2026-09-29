import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

/** The device cookie's name when none is given. */
export const DEVICE_COOKIE = 'janus-device';

/** Four hundred days: the longest a browser keeps a cookie. */
const MAX_AGE = 400 * 24 * 60 * 60;

/**
 * The long-lived cookie that holds the device token `@nxgt/janus` answers
 * as `deviceToken`. Every default is the strict one, as for the session
 * cookie; give `deviceOf` and `sendSession` the same options.
 */
export interface DeviceCookieOptions {
	/** `'janus-device'` when absent. */
	readonly name?: string;
	readonly domain?: string;
	/** `'/'` when absent. */
	readonly path?: string;
	/** `'Lax'` when absent. */
	readonly sameSite?: 'Lax' | 'Strict' | 'None';
	/** `true` when absent. */
	readonly secure?: boolean;
	/** In seconds. Four hundred days when absent — the longest a browser keeps one. */
	readonly maxAge?: number;
}

/**
 * The device token the request's cookie holds, or `null` when it holds none:
 * what a sign-in takes as `device`.
 *
 * ```ts
 * const signedIn = await auth.signIn({ email, password }, { device: deviceOf(c) });
 * ```
 */
export function deviceOf(
	c: Context,
	options: DeviceCookieOptions = {},
): string | null {
	const token = getCookie(c, options.name ?? DEVICE_COOKIE);
	return token === undefined || token === '' ? null : token;
}

/** Sets the device cookie, or sets it again so it lasts another `maxAge`. Appends. */
export function sendDevice(
	c: Context,
	deviceToken: string,
	options: DeviceCookieOptions = {},
): void {
	setCookie(c, options.name ?? DEVICE_COOKIE, deviceToken, {
		path: options.path ?? '/',
		...(options.domain === undefined ? {} : { domain: options.domain }),
		sameSite: options.sameSite ?? 'Lax',
		secure: options.secure ?? true,
		httpOnly: true,
		maxAge: options.maxAge ?? MAX_AGE,
	});
}
