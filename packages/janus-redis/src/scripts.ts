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

/**
 * Sets `key` to expire at `at`, or later if it already expires later — the
 * set of a user's sessions lives as long as their longest session. `GT`
 * treats a key with no expiry as expiring never, so a new key gets a plain
 * `PEXPIREAT` first.
 */
const EXTEND_SET = `
local function extendSet(key, at)
	if redis.call('PTTL', key) < 0 then
		redis.call('PEXPIREAT', key, at)
	else
		redis.call('PEXPIREAT', key, at, 'GT')
	end
end
`;

/**
 * Drops from `set` every member whose key, `prefix .. member`, Redis already
 * expired. Run on every insert, so a user's set holds their live sessions or
 * tokens and the few that lapsed since — never every one they ever had.
 */
const PRUNE = `
local function prune(set, prefix)
	for _, member in ipairs(redis.call('SMEMBERS', set)) do
		if redis.call('EXISTS', prefix .. member) == 0 then
			redis.call('SREM', set, member)
		end
	end
end
`;

/** A hash as `{ field, value, … }` for a reply: what `HGETALL` answers. */
const SESSION_FIELDS = `
local function session(key, id)
	local fields = redis.call('HGETALL', key)
	if #fields == 0 then return false end
	table.insert(fields, 1, id)
	return fields
end
`;

/**
 * `ARGV`: prefix, id, tokenHash, userId, authenticatedAt, expiresAt,
 * revokedAt, createdAt. Answers `1` when written, `0` for a retry. A token
 * hash another session holds is an error: it is not a retry.
 */
export const INSERT_SESSION = `${EXTEND_SET}${PRUNE}
local p, id, tokenHash, userId = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local key = p .. 'session:' .. id
if redis.call('EXISTS', key) == 1 then return 0 end
local tokenKey = p .. 'session:token:' .. tokenHash
local holder = redis.call('GET', tokenKey)
if holder and holder ~= id then
	return redis.error_reply('JANUS a session token hash is held by another session')
end
redis.call('HSET', key,
	'tokenHash', tokenHash, 'userId', userId, 'authenticatedAt', ARGV[5],
	'expiresAt', ARGV[6], 'revokedAt', ARGV[7], 'createdAt', ARGV[8])
redis.call('PEXPIREAT', key, ARGV[6])
redis.call('SET', tokenKey, id, 'PXAT', ARGV[6])
local sessions = p .. 'user:' .. userId .. ':sessions'
prune(sessions, p .. 'session:')
redis.call('SADD', sessions, id)
extendSet(sessions, ARGV[6])
return 1
`;

/** `ARGV`: prefix, tokenHash. Answers `[id, field, value, …]`, or `nil`. */
export const FIND_SESSION = `${SESSION_FIELDS}
local p = ARGV[1]
local id = redis.call('GET', p .. 'session:token:' .. ARGV[2])
if not id then return false end
return session(p .. 'session:' .. id, id)
`;

/**
 * `ARGV`: prefix, id, expiresAt. Moves the expiry of a standing session, and
 * answers it as written; `nil` for a session absent or revoked — an
 * extension racing a revocation never brings the session back.
 */
export const EXTEND_SESSION = `${EXTEND_SET}${SESSION_FIELDS}
local p, id, expiresAt = ARGV[1], ARGV[2], ARGV[3]
local key = p .. 'session:' .. id
if redis.call('EXISTS', key) == 0 then return false end
if redis.call('HGET', key, 'revokedAt') ~= '' then return false end
redis.call('HSET', key, 'expiresAt', expiresAt)
local written = session(key, id)
local tokenHash = redis.call('HGET', key, 'tokenHash')
local userId = redis.call('HGET', key, 'userId')
redis.call('PEXPIREAT', key, expiresAt)
redis.call('PEXPIREAT', p .. 'session:token:' .. tokenHash, expiresAt)
extendSet(p .. 'user:' .. userId .. ':sessions', expiresAt)
return written
`;

/**
 * `ARGV`: prefix, id, at. `1` when the session exists — revoked now or
 * already, keeping its first `revokedAt` — and `0` when there is none.
 */
export const REVOKE_SESSION = `
local key = ARGV[1] .. 'session:' .. ARGV[2]
if redis.call('EXISTS', key) == 0 then return 0 end
if redis.call('HGET', key, 'revokedAt') == '' then
	redis.call('HSET', key, 'revokedAt', ARGV[3])
end
return 1
`;

/**
 * `ARGV`: prefix, userId, at, except (`''` for none). Revokes every standing
 * session of the user but `except`, and answers how many. An id whose
 * session Redis already expired is dropped from the set on the way.
 */
export const REVOKE_USER_SESSIONS = `
local p, userId, at, except = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local sessions = p .. 'user:' .. userId .. ':sessions'
local revoked = 0
for _, id in ipairs(redis.call('SMEMBERS', sessions)) do
	local key = p .. 'session:' .. id
	if redis.call('EXISTS', key) == 0 then
		redis.call('SREM', sessions, id)
	elseif id ~= except and redis.call('HGET', key, 'revokedAt') == '' then
		redis.call('HSET', key, 'revokedAt', at)
		revoked = revoked + 1
	end
end
return revoked
`;

/**
 * `ARGV`: prefix, userId. Deletes every session of the user, standing,
 * revoked or lapsed, and answers how many were there.
 */
export const DELETE_USER_SESSIONS = `
local p, userId = ARGV[1], ARGV[2]
local sessions = p .. 'user:' .. userId .. ':sessions'
local deleted = 0
for _, id in ipairs(redis.call('SMEMBERS', sessions)) do
	local key = p .. 'session:' .. id
	local tokenHash = redis.call('HGET', key, 'tokenHash')
	if tokenHash then
		local tokenKey = p .. 'session:token:' .. tokenHash
		if redis.call('GET', tokenKey) == id then redis.call('DEL', tokenKey) end
		redis.call('DEL', key)
		deleted = deleted + 1
	end
end
redis.call('DEL', sessions)
return deleted
`;

/**
 * `ARGV`: prefix, tokenHash, kind, userId, address, expiresAt, spentAt,
 * createdAt, codeHash, attempts. The hash is the key, so a token already
 * there is a retry.
 */
export const INSERT_TOKEN = `${EXTEND_SET}${PRUNE}
local p, tokenHash, userId = ARGV[1], ARGV[2], ARGV[4]
local key = p .. 'token:' .. tokenHash
if redis.call('EXISTS', key) == 1 then return 0 end
redis.call('HSET', key,
	'kind', ARGV[3], 'userId', userId, 'address', ARGV[5],
	'expiresAt', ARGV[6], 'spentAt', ARGV[7], 'createdAt', ARGV[8],
	'codeHash', ARGV[9], 'attempts', ARGV[10])
redis.call('PEXPIREAT', key, ARGV[6])
local tokens = p .. 'user:' .. userId .. ':tokens'
prune(tokens, p .. 'token:')
redis.call('SADD', tokens, tokenHash)
extendSet(tokens, ARGV[6])
return 1
`;

/**
 * `ARGV`: prefix, tokenHash, kind, at. **Spends the token and answers it as
 * it was before**: `[field, value, …]`, or `nil` for no token of this kind.
 * A first `spentAt` is kept, so exactly one call ever reads it empty.
 */
export const CONSUME_TOKEN = `
local key = ARGV[1] .. 'token:' .. ARGV[2]
if redis.call('HGET', key, 'kind') ~= ARGV[3] then return false end
local before = redis.call('HGETALL', key)
if redis.call('HGET', key, 'spentAt') == '' then
	redis.call('HSET', key, 'spentAt', ARGV[4])
end
return before
`;

/**
 * `ARGV`: prefix, tokenHash, kind. **Counts one attempt and answers the token
 * as it is after**: an unspent token's `attempts` goes up by one, in the same
 * step as the read, so twenty concurrent calls answer twenty counts. A spent
 * token is answered as it is; `nil` for no token of this kind.
 */
export const COUNT_ATTEMPT = `
local key = ARGV[1] .. 'token:' .. ARGV[2]
if redis.call('HGET', key, 'kind') ~= ARGV[3] then return false end
if redis.call('HGET', key, 'spentAt') == '' then
	redis.call('HINCRBY', key, 'attempts', 1)
end
return redis.call('HGETALL', key)
`;

/** `ARGV`: prefix, userId. Deletes every token of the user, and answers how many. */
export const DELETE_USER_TOKENS = `
local p, userId = ARGV[1], ARGV[2]
local tokens = p .. 'user:' .. userId .. ':tokens'
local deleted = 0
for _, tokenHash in ipairs(redis.call('SMEMBERS', tokens)) do
	deleted = deleted + redis.call('DEL', p .. 'token:' .. tokenHash)
end
redis.call('DEL', tokens)
return deleted
`;
