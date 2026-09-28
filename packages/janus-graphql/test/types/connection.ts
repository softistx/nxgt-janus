/**
 * What the compiler refuses of `janusConnection()`, measured, numbered
 * after `fresh.ts`. The first blocks are the graphql-ws wiring the README
 * and the subscriptions guide show — Yoga's recipe, without Yoga, and
 * Bun's `upgrade` — which must keep compiling against graphql-ws's own
 * types.
 */

import type { ServerWebSocket } from 'bun';
import type { ExecutionArgs } from 'graphql';
import { useServer } from 'graphql-ws/use/ws';
import { createSchema, createYoga } from 'graphql-yoga';
import type { WebSocketServer } from 'ws';
import {
	applyJanusDirectives,
	janusConnection,
	janusTypeDefs,
	useJanus,
} from '../../src/index';
import { setup } from '../harness';

const { auth, access, clock } = setup();

declare const wsServer: WebSocketServer;

const yoga = createYoga({
	schema: createSchema({ typeDefs: [janusTypeDefs, 'type Query { a: Int }'] }),
	plugins: [useJanus({ auth, access })],
});

type Roots = { readonly rootValue: ReturnType<typeof yoga.getEnveloped> };

// Yoga's recipe, and onConnect from janusConnection().
const connection = janusConnection({ auth });
useServer(
	{
		onConnect: connection.onConnect,
		execute: (args) => (args as ExecutionArgs & Roots).rootValue.execute(args),
		subscribe: (args) =>
			(args as ExecutionArgs & Roots).rootValue.subscribe(args),
		onSubscribe: async (ctx, _id, params) => {
			const enveloped = yoga.getEnveloped({
				...ctx,
				req: ctx.extra.request,
				socket: ctx.extra.socket,
				params,
			});
			const args = {
				schema: enveloped.schema,
				operationName: params.operationName,
				document: enveloped.parse(params.query),
				variableValues: params.variables,
				contextValue: await enveloped.contextFactory(),
				rootValue: enveloped,
			};
			const errors = enveloped.validate(args.schema, args.document);
			return errors.length > 0 ? errors : args;
		},
	},
	wsServer,
);

// Without Yoga: context too, typed as JanusContext.
const plain = janusConnection({ auth, access, clock });
useServer(
	{
		schema: applyJanusDirectives(yoga.getEnveloped().schema, { auth, access }),
		onConnect: plain.onConnect,
		context: plain.context,
	},
	wsServer,
);
export const staff = janusConnection({ auth, type: 'staff' })
	.context({ extra: {} })
	.janus.user()
	.then((user) => user?.username);

type Upgraded = ServerWebSocket<{ readonly request: Request }>;

// Bun's extra carries no request: upgrade reads it where the server put it.
export const onBun = janusConnection({
	auth,
	// server.upgrade(req, { data: { request: req } }) put it in the socket's data.
	upgrade: (ctx: { readonly extra: { readonly socket: Upgraded } }) =>
		ctx.extra.socket.data.request,
});

// 30. A user type the instance does not know.
// @ts-expect-error — 'doctor' is neither 'patient' nor 'staff'.
janusConnection({ auth, type: 'doctor' });

// 31. The permissions() instance passed as `auth`.
// @ts-expect-error — `access` is not `auth`.
janusConnection({ auth: access });

// 32. `ctx.janus.access` from a connection given no `access`.
// @ts-expect-error — `access` exists only once janusConnection() is given one.
connection.context({ extra: {} }).janus.access;

// 33. A field of another user type, once the connection is narrowed.
janusConnection({ auth, type: 'staff' })
	.context({ extra: {} })
	.janus.user()
	// @ts-expect-error — a staff member has a username, not an email.
	.then((user) => user?.email);

// 34. An upgrade answering the token rather than the request.
// @ts-expect-error — `upgrade` answers what `auth.authenticate` reads.
janusConnection({ auth, upgrade: () => 'token' });

// 35. A clock that is not a Clock: a timestamp.
// @ts-expect-error — `clock` answers `now()`: pass the clock given to janus().
janusConnection({ auth, clock: Date.now() });
