/**
 * Reading the session token a request presents, whatever shape the request
 * arrives in.
 */

import type { HeaderRecord, RequestLike } from '../types';

/**
 * The session token a request presents: `Authorization: Bearer`, then
 * `X-Session-Token`, then the cookie.
 *
 * **The first credential present wins, not the first valid one.** A browser
 * sending a lapsed bearer beside a live cookie is anonymous, and should fix its
 * header rather than be rescued in silence — the rule `resolve` in `nxgt-ory`'s
 * SDK learned. An `Authorization` header of another scheme (`Basic`) is not a
 * session credential, and does not count as one.
 */
export function presentedToken(
	request: RequestLike,
	cookieName: string,
): string | null {
	const headers = headersOf(request);
	const read = (name: string): string | null => {
		if (headers instanceof Headers) return headers.get(name);
		for (const [key, value] of Object.entries(headers)) {
			if (key.toLowerCase() !== name || value === undefined) continue;
			return typeof value === 'string' ? value : value.join(', ');
		}
		return null;
	};

	const authorization = read('authorization');
	if (authorization !== null) {
		const match = /^bearer(?:\s+(.*))?$/i.exec(authorization.trim());
		if (match) return match[1]?.trim() ?? '';
	}

	const header = read('x-session-token');
	if (header !== null) return header.trim();

	const cookie = read('cookie');
	if (cookie !== null) {
		for (const pair of cookie.split(';')) {
			const at = pair.indexOf('=');
			if (at !== -1 && pair.slice(0, at).trim() === cookieName) {
				return pair.slice(at + 1).trim();
			}
		}
	}

	return null;
}

/**
 * The headers of whatever was passed: a `Request`, `Headers`, anything with a
 * `headers` property — Node's `IncomingMessage` — or a plain record.
 */
function headersOf(request: RequestLike): Headers | HeaderRecord {
	if (request instanceof Headers) return request;
	const inner = (request as { headers?: unknown }).headers;
	if (inner instanceof Headers) return inner;
	if (typeof inner === 'object' && inner !== null) return inner as HeaderRecord;
	return request as HeaderRecord;
}
