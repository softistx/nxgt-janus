/**
 * The Lua scripts, one per port method that reads more than one key or
 * writes anything. **A script is atomic**: Redis runs nothing else while it
 * does, which is what the port asks of every method (rule 5) — and what makes
 * `consumeToken` one step, never a read and then a write.
 *
 * Every key is built inside the script from `ARGV[1]`, the prefix. A method's
 * keys depend on what it reads first — a session's token key on the session
 * — so they cannot all be declared up front. That is also why Redis Cluster
 * is not supported: a script may touch keys of more than one slot.
 *
 * Dates travel as milliseconds since the epoch, and `null` as `''`: a hash
 * field holds a string, and no date is ever the empty string.
 */

export {
	DELETE_USER_SESSIONS,
	EXTEND_SESSION,
	FIND_SESSION,
	INSERT_SESSION,
	REAUTHENTICATE_SESSION,
	REVOKE_SESSION,
	REVOKE_USER_SESSIONS,
} from './sessions';
export {
	CONSUME_TOKEN,
	COUNT_ATTEMPT,
	DELETE_USER_TOKENS,
	INSERT_TOKEN,
	SPEND_USER_TOKENS,
} from './tokens';
