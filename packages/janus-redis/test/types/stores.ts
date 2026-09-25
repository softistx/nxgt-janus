/**
 * What the adapter refuses at compile time: each `@ts-expect-error` is a
 * plausible mistake that must not compile.
 */

import { janus, scryptHasher } from '@nxgt/janus';
import { connectRedis } from '@nxgt/redis';
import { RedisClient } from 'bun';
import { z } from 'zod';
import { createRedisStores } from '../../src/index';

const redis = await connectRedis('redis://localhost:6379');
export const stores = createRedisStores(redis, { prefix: 'clinic:' });

// @ts-expect-error 1. a URL: the adapter connects to nothing
createRedisStores('redis://localhost:6379');
// @ts-expect-error 2. Bun's client: the connection `connectRedis` answers holds it
createRedisStores(new RedisClient('redis://localhost:6379'));

export const auth = janus({
	user: z.strictObject({ email: z.email() }),
	password: { login: 'email' },
	hasher: scryptHasher(),
	// @ts-expect-error 3. sessions and tokens alone: users need a store of their own
	store: createRedisStores(redis),
});
