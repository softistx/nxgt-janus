/** The scripts of the token store: one per method that reads more than one key or writes. */

import { EXTEND_SET, PRUNE } from './shared';

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

/**
 * `ARGV`: prefix, userId, kind, at, except. **Spends every unspent token of
 * the user of this kind** — but the one whose hash is `except`, `''` for
 * none — and answers how many. One script, so a `consumeToken` of
 * the same token runs wholly before or wholly after it: exactly one of the
 * two spends it. A token Redis already expired is a member of the set no
 * more than a key, and is not counted.
 */
export const SPEND_USER_TOKENS = `
local p, userId, kind, at, except = ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]
local spent = 0
for _, tokenHash in ipairs(redis.call('SMEMBERS', p .. 'user:' .. userId .. ':tokens')) do
	local key = p .. 'token:' .. tokenHash
	if tokenHash ~= except and redis.call('HGET', key, 'kind') == kind and redis.call('HGET', key, 'spentAt') == '' then
		redis.call('HSET', key, 'spentAt', at)
		spent = spent + 1
	end
end
return spent
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
