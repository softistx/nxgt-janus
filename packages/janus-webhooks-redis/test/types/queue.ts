/**
 * What the adapter refuses at compile time: each `@ts-expect-error` is a
 * plausible mistake that must not compile.
 */

import { type WebhookQueue, webhooks } from '@nxgt/janus-webhooks';
import { connectRedis } from '@nxgt/redis';
import { RedisClient } from 'bun';
import { createRedisWebhookQueue } from '../../src/index';

const redis = await connectRedis('redis://localhost:6379');
export const queue: WebhookQueue = createRedisWebhookQueue(redis, {
	prefix: 'clinic:webhooks:',
});

export const listener = webhooks({
	endpoints: [
		{
			id: 'crm',
			url: 'https://crm.example.test/hooks',
			secrets: ['whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'],
		},
	],
	queue,
});

// @ts-expect-error 1. a URL: the adapter connects to nothing
createRedisWebhookQueue('redis://localhost:6379');
// @ts-expect-error 2. Bun's client: the connection `connectRedis` answers holds it
createRedisWebhookQueue(new RedisClient('redis://localhost:6379'));
// @ts-expect-error 3. a prefix is a string
createRedisWebhookQueue(redis, { prefix: 1 });
// @ts-expect-error 4. the connection, not a promise of it: `connectRedis` is awaited first
createRedisWebhookQueue(connectRedis('redis://localhost:6379'));
