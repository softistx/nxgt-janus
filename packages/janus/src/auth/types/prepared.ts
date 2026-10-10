/**
 * What `prepare` answers — `magicLink.prepare`, `signInCode.prepare`,
 * `resetPassword.prepare`: a request for an e-mail, counted, not yet looked
 * up.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

import type { IssuedCode } from './email-flows';

/**
 * A request counted by the mail throttle and not yet looked up: `send()`
 * does the rest of what `request` does — looks the address up, issues, and
 * spends the earlier tokens — and answers what `request` answers, `null`
 * for an address nobody (active) holds.
 *
 * **`send()` runs once.** A second call is a `TypeError`, and so is a call
 * after a first one failed: `prepare` again, which counts again.
 */
export interface PreparedRequest<Issued> {
	/**
	 * Looks the address up and issues, without counting again — the count
	 * was `prepare`'s. Send it off the visitor's request: its time tells
	 * whether the address has an account.
	 */
	send(): Promise<Issued | null>;
}

/**
 * A sign-in code's prepared request: the `challenge` is minted before
 * anybody is looked up, so it goes to the visitor now, whoever holds the
 * address — and replaces the decoy an unknown address needs. For an address
 * nobody holds, `send()` answers `null` and the challenge is
 * `TOKEN_UNKNOWN`; otherwise it is the `challenge` of what `send()` issues.
 */
export interface PreparedCode<U> extends PreparedRequest<IssuedCode<U>> {
	/**
	 * The secret the code will be checked against. **Keep it with the
	 * visitor** — a short-lived cookie, or the code form's body — never in
	 * the e-mail, a URL or a log.
	 */
	readonly challenge: string;
}
