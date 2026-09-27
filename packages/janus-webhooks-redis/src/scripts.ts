/**
 * The Lua scripts, **one per port method**. A script is atomic: Redis runs
 * nothing else while it does, which is what the port asks of every method —
 * and what makes a claim one step, so two claims running at once never
 * answer one delivery.
 *
 * The layout, every key built inside the script from `ARGV[1]`, the prefix:
 *
 * | Key | Type | Holds |
 * | --- | --- | --- |
 * | `{p}delivery:{id}` | hash | `eventId type occurredAt userId userType endpoint attempts lease`, and `status error` once an attempt failed |
 * | `{p}due:{endpoint}` | sorted set | one member per delivery id, scored by when it is due — or, while claimed, when its lease ends |
 * | `{p}endpoints` | set | the endpoint ids with deliveries waiting: what an orphan claim walks |
 *
 * A key's name depends on the arguments — a delivery's key on its endpoint —
 * so the keys are not declared up front. That is why Redis Cluster is not
 * supported: one script may touch keys of more than one slot.
 *
 * Dates travel as milliseconds since the epoch, passed in by the caller —
 * never Redis's `TIME` — and `null` as `''`. An `error` of `''` is read as
 * `null` too: a failure is named by its class, never the empty string.
 */

/**
 * Claims up to `remaining` deliveries of one endpoint due at `now`, earliest
 * first, into `out`, and answers how many it may still claim. A member
 * whose hash is gone — a key deleted by hand — is dropped on the way, and
 * the walk goes on past it.
 */
const CLAIM_FROM = `
local function claimFrom(p, endpoint, now, leaseUntil, lease, remaining, out)
	local due = p .. 'due:' .. endpoint
	local stale
	repeat
		stale = false
		local ids = redis.call('ZRANGEBYSCORE', due, '-inf', now, 'LIMIT', 0, remaining)
		for _, id in ipairs(ids) do
			local key = p .. 'delivery:' .. id
			if redis.call('EXISTS', key) == 0 then
				redis.call('ZREM', due, id)
				stale = true
			else
				redis.call('HINCRBY', key, 'attempts', 1)
				redis.call('HSET', key, 'lease', lease)
				redis.call('ZADD', due, leaseUntil, id)
				local fields = redis.call('HGETALL', key)
				table.insert(fields, 1, id)
				out[#out + 1] = fields
				remaining = remaining - 1
			end
		end
	until remaining <= 0 or not stale
	if redis.call('ZCARD', due) == 0 then
		redis.call('SREM', p .. 'endpoints', endpoint)
	end
	return remaining
end
`;

/**
 * The delivery `id`'s key, when `lease` is the one it holds; `nil`
 * otherwise. A released lease is `''`, which no claim ever hands out.
 */
const LEASED = `
local function leased(p, id, lease)
	local key = p .. 'delivery:' .. id
	if lease == '' or redis.call('HGET', key, 'lease') ~= lease then return nil end
	return key
end
`;

/**
 * `ARGV`: prefix, eventId, type, occurredAt, userId, userType, dueAt, then
 * the endpoints. Answers how many deliveries were new. A delivery already
 * held — waiting, claimed or waiting for a retry — is kept as it is.
 *
 * **All or none**: Redis does not roll a script back when a command in it
 * fails — a key of the wrong type, a permission refused — so the inserts run
 * under `pcall`, each write recording how to undo it, and a failure undoes
 * every write before it, in reverse, before the script fails.
 */
export const INSERT_DELIVERIES = `
local p, eventId, eventType, dueAt = ARGV[1], ARGV[2], ARGV[3], ARGV[7]
local undo = {}
local function write(rollback, ...)
	local reply = redis.call(...)
	undo[#undo + 1] = rollback
	return reply
end
local inserted = 0
local ok, failure = pcall(function()
	local endpoints = p .. 'endpoints'
	for i = 8, #ARGV do
		local endpoint = ARGV[i]
		local id = eventId .. ':' .. eventType .. ':' .. endpoint
		local key = p .. 'delivery:' .. id
		if redis.call('EXISTS', key) == 0 then
			local due = p .. 'due:' .. endpoint
			write({ 'ZREM', due, id }, 'ZADD', due, dueAt, id)
			if redis.call('SISMEMBER', endpoints, endpoint) == 0 then
				write({ 'SREM', endpoints, endpoint }, 'SADD', endpoints, endpoint)
			end
			write({ 'DEL', key }, 'HSET', key,
				'eventId', eventId, 'type', eventType, 'occurredAt', ARGV[4],
				'userId', ARGV[5], 'userType', ARGV[6], 'endpoint', endpoint,
				'attempts', '0', 'lease', '')
			inserted = inserted + 1
		end
	end
end)
if ok then return inserted end
for i = #undo, 1, -1 do redis.pcall(unpack(undo[i])) end
if type(failure) == 'table' and failure.err then
	return redis.error_reply(failure.err)
end
return redis.error_reply(tostring(failure))
`;

/**
 * `ARGV`: prefix, now, leaseUntil, limit, lease, then the endpoints in the
 * order to walk them. Answers `[[id, field, value, …], …]`.
 */
export const CLAIM_DELIVERIES = `${CLAIM_FROM}
local p, now, leaseUntil, lease = ARGV[1], ARGV[2], ARGV[3], ARGV[5]
local remaining = tonumber(ARGV[4])
local out = {}
for i = 6, #ARGV do
	if remaining <= 0 then break end
	remaining = claimFrom(p, ARGV[i], now, leaseUntil, lease, remaining, out)
end
return out
`;

/**
 * `ARGV`: prefix, dueBefore, leaseUntil, limit, lease, then the endpoints
 * known. The same claim, over every endpoint with deliveries that is not
 * known, in the order of their ids.
 */
export const CLAIM_ORPHANED_DELIVERIES = `${CLAIM_FROM}
local p, dueBefore, leaseUntil, lease = ARGV[1], ARGV[2], ARGV[3], ARGV[5]
local remaining = tonumber(ARGV[4])
local known = {}
for i = 6, #ARGV do known[ARGV[i]] = true end
local orphaned = {}
for _, endpoint in ipairs(redis.call('SMEMBERS', p .. 'endpoints')) do
	if not known[endpoint] then orphaned[#orphaned + 1] = endpoint end
end
table.sort(orphaned)
local out = {}
for _, endpoint in ipairs(orphaned) do
	if remaining <= 0 then break end
	remaining = claimFrom(p, endpoint, dueBefore, leaseUntil, lease, remaining, out)
end
return out
`;

/** `ARGV`: prefix, id, lease, until. `1` when extended, `0` when not held. */
export const EXTEND_LEASE = `${LEASED}
local p, id = ARGV[1], ARGV[2]
local key = leased(p, id, ARGV[3])
if not key then return 0 end
local endpoint = redis.call('HGET', key, 'endpoint')
redis.call('ZADD', p .. 'due:' .. endpoint, ARGV[4], id)
return 1
`;

/**
 * `ARGV`: prefix, id, lease, dueAt, status, error — `''` for `null`. `1`
 * when scheduled and the lease released, `0` when not held.
 */
export const SCHEDULE_RETRY = `${LEASED}
local p, id = ARGV[1], ARGV[2]
local key = leased(p, id, ARGV[3])
if not key then return 0 end
redis.call('HSET', key, 'status', ARGV[5], 'error', ARGV[6], 'lease', '')
local endpoint = redis.call('HGET', key, 'endpoint')
redis.call('ZADD', p .. 'due:' .. endpoint, ARGV[4], id)
return 1
`;

/**
 * `ARGV`: prefix, id, lease. `1` when removed, `0` when not held or gone.
 * The endpoint leaves the set of endpoints with its last delivery.
 */
export const DELETE_DELIVERY = `${LEASED}
local p, id = ARGV[1], ARGV[2]
local key = leased(p, id, ARGV[3])
if not key then return 0 end
local endpoint = redis.call('HGET', key, 'endpoint')
local due = p .. 'due:' .. endpoint
redis.call('ZREM', due, id)
redis.call('DEL', key)
if redis.call('ZCARD', due) == 0 then
	redis.call('SREM', p .. 'endpoints', endpoint)
end
return 1
`;
