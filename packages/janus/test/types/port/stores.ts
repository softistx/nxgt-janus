/**
 * The stores and what their methods answer: a missing method, an absence as
 * undefined, answers too poor to act on, the wrong store in a slot. Cases
 * 1–5, 16, 24 and 25 of the twenty-five — see `fixtures.ts`.
 */

import { createMemoryStores } from '../../../src/auth/port/memory';
import type {
	JanusStores,
	SessionRecord,
	SessionStore,
	TokenStore,
	UserStore,
} from '../../../src/auth/port/types';
import { sessions, tokens, users } from './fixtures';

// ── 1. A store missing a method ─────────────────────────────────────────────
// The compiler names the missing method; `assertStores` is the net for
// JavaScript.
// @ts-expect-error updateUser is missing
const partial: UserStore = {
	insertUser: users.insertUser,
	findUser: users.findUser,
	findUserByLogin: users.findUserByLogin,
	listUsers: users.listUsers,
};

// ── 2. An absence answered as undefined ────────────────────────────────────
// Rule 2. `undefined` is what a function that forgot to `return` produces, so
// "not found" by accident is refused here rather than discovered in production.
const undefinedAbsence: UserStore = {
	...users,
	// @ts-expect-error an absence is null, not undefined
	findUser: async () => undefined,
};

// ── 3. A revocation that answers nothing ───────────────────────────────────
// `Promise<void>` would let a store that never checked report success.
const silentRevoke: SessionStore = {
	...sessions,
	// @ts-expect-error revokeSession answers whether the session existed
	revokeSession: async () => {},
};

// ── 4. consumeToken as a boolean ───────────────────────────────────────────
// A boolean cannot say whether THIS call spent the token, which is the whole
// point of answering the token as it was before the call.
const booleanConsume: TokenStore = {
	...tokens,
	// @ts-expect-error consumeToken answers the token before the call, or null
	consumeToken: async () => true,
};

// ── 5. The wrong store in a slot ───────────────────────────────────────────
const swapped: JanusStores = {
	// @ts-expect-error a session store is not a user store
	users: sessions,
	sessions,
	tokens,
};

// ── 16. countAttempt answering a count ────────────────────────────────────
// A bare number cannot say the token was already spent, nor whose it is: the
// core needs the record as it is after the call.
const numberCount: TokenStore = {
	...tokens,
	// @ts-expect-error countAttempt answers the token after the call, or null
	countAttempt: async () => 1,
};

// ── 24. reauthenticateSession answering a boolean ─────────────────────────
// revokeSession's answer, copied: `true` cannot say the session was revoked
// meanwhile rather than written, and the core answers the session it wrote.
const booleanReauth: SessionStore = {
	...sessions,
	// @ts-expect-error reauthenticateSession answers the session as written, or null
	reauthenticateSession: async () => true,
};

// ── 25. findUsers answering null for ids nobody holds ─────────────────────
// An absence there is a shorter list. A `null` would be one more answer the
// core must tell from a failure, on the one method that reads many users.
const nullBatch: UserStore = {
	...users,
	// @ts-expect-error findUsers answers a list, empty when nobody holds the ids
	findUsers: async () => null,
};

// ── And the shapes that MUST keep compiling ─────────────────────────────────

// A step-up's write answers the record, or null once revoked.
const reauthenticated: Promise<SessionRecord | null> =
	sessions.reauthenticateSession('id', new Date());

// The optional capabilities may be absent.
const { deleteExpiredSessions: _, ...withoutCollect } = sessions;
const minimalSessions: SessionStore = withoutCollect;
const { findUsers: __, ...withoutBatch } = users;
const minimalUsers: UserStore = withoutBatch;

// The reference store is a complete set.
const reference: JanusStores = createMemoryStores();

// A class implements the port as well as an object literal does.
class ClassStore implements TokenStore {
	async insertToken(): Promise<void> {}
	async consumeToken(): Promise<null> {
		return null;
	}
	async countAttempt(): Promise<null> {
		return null;
	}
	async spendUserTokens(): Promise<number> {
		return 0;
	}
	async deleteUserTokens(): Promise<number> {
		return 0;
	}
}

export const checked = {
	refused: [
		partial,
		undefinedAbsence,
		silentRevoke,
		booleanConsume,
		swapped,
		numberCount,
		booleanReauth,
		nullBatch,
	],
	allowed: [
		minimalSessions,
		minimalUsers,
		reference,
		ClassStore,
		reauthenticated,
	],
};
