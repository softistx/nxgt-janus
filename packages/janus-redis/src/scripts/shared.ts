/**
 * What the scripts of both stores share: keeping a user's set of keys alive,
 * and pruning it of the keys Redis already expired.
 */

/**
 * Sets `key` to expire at `at`, or later if it already expires later — the
 * set of a user's sessions lives as long as their longest session. `GT`
 * treats a key with no expiry as expiring never, so a new key gets a plain
 * `PEXPIREAT` first.
 */
export const EXTEND_SET = `
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
export const PRUNE = `
local function prune(set, prefix)
	for _, member in ipairs(redis.call('SMEMBERS', set)) do
		if redis.call('EXISTS', prefix .. member) == 0 then
			redis.call('SREM', set, member)
		end
	end
end
`;
