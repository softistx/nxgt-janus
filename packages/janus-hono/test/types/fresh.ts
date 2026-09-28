/**
 * What the compiler refuses, measured: each `@ts-expect-error` below is a
 * plausible mistake, and fails the typecheck the day it compiles.
 */

import { Hono } from 'hono';
import { fresh, session } from '../../src/index';
import { setup } from '../app';

const { auth, clock } = setup();

new Hono()
	// What must keep compiling: after `session()`, with or without the clock.
	.delete('/account', session(auth, { required: true }), fresh('10m'), (c) =>
		c.body(null, 204),
	)
	.post('/email', session(auth), fresh('5m', { clock }), (c) =>
		c.body(null, 204),
	);

// 1. A maxAge that is no duration.
// @ts-expect-error — a duration is a number and a unit: '10m', not '10 minutes'.
fresh('10 minutes');
