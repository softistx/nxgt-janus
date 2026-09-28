/** The scripts of the session store: one per method that reads more than one key or writes. */

import { EXTEND_SET, PRUNE } from './shared';

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
 * `ARGV`: prefix, id, at. Moves `authenticatedAt` of a standing session — a
 * step-up — and answers it as written; `nil` for a session absent or
 * revoked, so a confirmation racing a revocation never brings it back. The
 * expiry, and so every key's, stays as it was.
 */
export const REAUTHENTICATE_SESSION = `${SESSION_FIELDS}
local key = ARGV[1] .. 'session:' .. ARGV[2]
if redis.call('EXISTS', key) == 0 then return false end
if redis.call('HGET', key, 'revokedAt') ~= '' then return false end
redis.call('HSET', key, 'authenticatedAt', ARGV[3])
return session(key, ARGV[2])
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
