/**
 * The one-time tokens store: what a token is for, its record, and the port a
 * store implements for them.
 *
 * Part of the store port; the rules every implementation keeps are in
 * `./index`.
 */

import type { Id } from '../../../ids/id';

/**
 * What a one-time token is for. A token redeemed for another purpose is
 * unknown.
 *
 * - `verifyEmail`, `resetPassword`: a link sent by e-mail.
 * - `secondFactor`: the challenge a sign-in answers when the user has a second
 *   factor, redeemed with a code from their app — and the count of a user's
 *   attempts at `regenerateRecoveryCodes`, a token of this kind whose secret
 *   nobody is given, never redeemed, only counted.
 * - `signInCode`: a code sent by e-mail to sign in without a password.
 */
export type TokenKind =
	| 'verifyEmail'
	| 'resetPassword'
	| 'secondFactor'
	| 'signInCode';

/** A one-time token, as a store holds it: its hash, never its secret. */
export interface TokenRecord {
	/** `sha256` of the token's secret, hex. Unique across the store. */
	readonly tokenHash: string;
	readonly kind: TokenKind;
	readonly userId: Id;
	/**
	 * The e-mail the token was sent to — the one a verification marks
	 * verified. `''` for a second-factor challenge, which nothing was sent for.
	 */
	readonly address: string;
	/**
	 * For a token redeemed with a code — `signInCode` — the code's hash, keyed
	 * by the token's secret, so the tokens alone do not reveal it. `null` for
	 * every other kind: the core writes it so, and a store keeps what it is
	 * given.
	 */
	readonly codeHash: string | null;
	/**
	 * How many codes were tried against it: `0` at insertion, and one more on
	 * every {@link TokenStore.countAttempt}. What bounds the attempts at a
	 * six-digit code.
	 */
	readonly attempts: number;
	readonly expiresAt: Date;
	/** `null` until spent. Once set, never changes. */
	readonly spentAt: Date | null;
	readonly createdAt: Date;
}

/** One-time tokens. Ephemeral by construction. */
export interface TokenStore {
	/**
	 * Stores a new token. Idempotent under retry: when a token with this hash
	 * exists, it writes nothing.
	 */
	insertToken(record: TokenRecord): Promise<void>;

	/**
	 * **The most important method on this port.** Spends the token and answers
	 * it **as it was before this call**.
	 *
	 * - `spentAt: null` in the answer means *this call* spent it. Exactly one
	 *   call ever sees that.
	 * - `spentAt` set means it was already spent, and nothing was written.
	 * - `null` means no token of this `kind` has this hash — including one the
	 *   store has already dropped. A token of the other kind is not touched.
	 *
	 * **One conditional write, never a read followed by a write.** A reset token
	 * two concurrent requests both redeem is an account takeover: twenty
	 * concurrent calls must produce exactly one answer with `spentAt: null`, and
	 * the conformance suite runs exactly that. In MongoDB this is one
	 * `findOneAndUpdate` returning the document *before* the update.
	 *
	 * A lapsed token is spent all the same. Comparing `expiresAt` is the core's
	 * job, after the call, so a lapsed token can never be retried.
	 */
	consumeToken(
		tokenHash: string,
		kind: TokenKind,
		at: Date,
	): Promise<TokenRecord | null>;

	/**
	 * Counts one attempt at a code against a token, and answers the token **as
	 * it is after this call**.
	 *
	 * - An **unspent** token of this `kind` has `attempts` one higher, and is
	 *   answered with it. Twenty concurrent calls answer twenty distinct
	 *   counts: one conditional write, never a read followed by a write — a
	 *   count two guesses both read is a guess for free.
	 * - A **spent** token is answered as it is, and nothing is written. A
	 *   store keeps a spent token, answered as spent, until its `expiresAt`:
	 *   dropping it sooner would start a count over.
	 * - `null` means no token of this `kind` has this hash.
	 *
	 * A **lapsed** token is counted all the same, or answered `null` by a store
	 * that already dropped it — as for `consumeToken`, comparing `expiresAt` is
	 * the core's job, after the call.
	 *
	 * Whether the count is past the limit, and whether the code matches, is the
	 * core's decision, after the call; spending the token is `consumeToken`.
	 */
	countAttempt(tokenHash: string, kind: TokenKind): Promise<TokenRecord | null>;

	/**
	 * Spends every **unspent** token of one user and one `kind` at `at` —
	 * but the one whose hash is `except`, when given — and answers how many
	 * it spent. What issuing a sign-in code calls, sparing the code it just
	 * issued, so only the last code sent works; and what writing a password
	 * calls, so no second-factor challenge opened with the old one survives.
	 *
	 * - A spent token keeps its `spentAt`: it never changes once set.
	 * - A token of another `kind`, or of another user, is not touched.
	 * - An expired token is spent all the same, or not counted by a store that
	 *   already dropped it.
	 * - `0` for a user with none: an absence, not a failure.
	 *
	 * Each token is spent by a conditional write, as `consumeToken` spends
	 * one: a token `consumeToken` spends at the same moment is counted by
	 * exactly one of the two calls.
	 */
	spendUserTokens(
		userId: Id,
		kind: TokenKind,
		at: Date,
		except?: string,
	): Promise<number>;

	/**
	 * Deletes every token of one user, spent or not, and answers how many.
	 * What deleting a user calls: a token holds the e-mail it was sent to, which
	 * must not outlive the user until its expiry.
	 */
	deleteUserTokens(userId: Id): Promise<number>;
}
