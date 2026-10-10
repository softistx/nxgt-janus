/**
 * Sign-in links: a type with no e-mail, a session read off a link that may
 * still ask for a factor, a token read off a request that found nobody, and
 * a link confirmed like a sign-in code. Cases 51–54 of the seventy-two — see
 * `fixtures.ts`. The shapes that must keep compiling are in `allowed.ts`.
 */

import { clinic, one, twoFactor } from './fixtures';

async function magicLinks() {
	// ── 51. A sign-in link for a type with no e-mail ──────────────────────
	// @ts-expect-error staff have no e-mail to send a link to
	await clinic.staff.magicLink.request('a@b.test');

	// ── 52. A session read off a link that may still ask for a factor ─────
	const linked = await twoFactor.patient.magicLink.confirm('token');
	// @ts-expect-error the link proves the e-mail; an active factor is still asked for
	void linked.token;

	// ── 53. A token read off a request that may have found nobody ─────────
	const issued = await one.magicLink.request('a@b.test');
	// @ts-expect-error null when nobody holds the e-mail: send nothing then
	void issued.token;

	// ── 54. A link confirmed like a sign-in code, with a code ─────────────
	// @ts-expect-error a link carries no code: confirm takes its token alone
	await one.magicLink.confirm('token', '123456');
}

export const checked = { magicLinks };
