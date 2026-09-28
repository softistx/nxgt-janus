# Subscriptions over graphql-ws

A subscription over server-sent events is an HTTP request like any other:
`useJanus()` authenticates it from its headers, and nothing more is needed.
Over a WebSocket, every operation travels over one socket, opened once:
`janusConnection()` authenticates that socket, with
[graphql-ws](https://github.com/enisdenjo/graphql-ws), the library Yoga
recommends, so the directives hold on it unchanged.

## Install

`graphql-ws` is an **optional** peer: install it only when you serve
subscriptions over a WebSocket.

```sh
bun add graphql-ws ws
```

Its range, `^6.0.0`, and the `graphql` 17 note are in the
[README's Install](../README.md#install).

## Wiring, with Yoga

This is Yoga's recommended graphql-ws setup, with one line added:
`onConnect`.

```ts
import { createServer } from 'node:http';
import { janusConnection, janusMaskError, janusTypeDefs, useJanus } from '@nxgt/janus-graphql';
import { useServer } from 'graphql-ws/use/ws';
import { createSchema, createYoga } from 'graphql-yoga';
import { WebSocketServer } from 'ws';
import { access } from './access'; // what permissions() answered
import { auth } from './auth'; // what janus() answered

const yoga = createYoga({
	schema: createSchema({ typeDefs: [janusTypeDefs, typeDefs], resolvers }),
	plugins: [useJanus({ auth, access })],
	maskedErrors: { maskError: janusMaskError() },
});

const server = createServer(yoga);
const wsServer = new WebSocketServer({ server, path: yoga.graphqlEndpoint });

useServer(
	{
		onConnect: janusConnection({ auth }).onConnect, // refuses a connection with no valid session
		execute: (args: any) => args.rootValue.execute(args),
		subscribe: (args: any) => args.rootValue.subscribe(args),
		onSubscribe: async (ctx, _id, params) => {
			const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({
				...ctx, // carries ctx.extra, where useJanus() finds the connection
				req: ctx.extra.request,
				socket: ctx.extra.socket,
				params,
			});
			const args = {
				schema,
				operationName: params.operationName,
				document: parse(params.query),
				variableValues: params.variables,
				contextValue: await contextFactory(),
				rootValue: { execute, subscribe },
			};
			const errors = validate(args.schema, args.document);
			if (errors.length) return errors;
			return args;
		},
	},
	wsServer,
);

server.listen(4000);
```

`useJanus()` needs nothing new. When it builds the context of an operation
with no `request`, it looks for the connection the operation came from —
by `ctx.extra`, which the `...ctx` spread carries — and authenticates the
credential that connection presented. **Keep the spread**: a context built
without `ctx.extra` has no connection to find, and its first guarded field
throws [`the GraphQL context has no request to authenticate`](../troubleshooting.md#typeerror-usejanus-the-graphql-context-has-no-request-to-authenticate).

## How the session travels

`onConnect` reads one credential per connection, in this order:

1. **`connectionParams.authorization`** — for a client that is not a
   browser, or a browser that holds a bearer token:

   ```ts
   import { createClient } from 'graphql-ws';

   const client = createClient({
   	url: 'wss://api.example.com/graphql',
   	connectionParams: async () => ({ authorization: `Bearer ${await tokens.current()}` }),
   });
   ```

   The key is `authorization`, lower-case, and its value a string — the
   same `Bearer <token>` an HTTP request sends. A value that is not a
   string refuses the connection; a string of another scheme (`Basic …`)
   is not a session credential, as in `@nxgt/janus`, and the upgrade
   request is read instead.

2. **The upgrade request**, read as `auth.authenticate` reads any request:
   `Authorization: Bearer`, then `X-Session-Token`, then the session
   cookie. A browser sends its cookies with the upgrade, so a signed-in
   browser needs no `connectionParams` at all — provided the WebSocket goes
   to the origin that set the cookie, or to one its `SameSite` admits.

**The first credential present wins, not the first valid one**, as in
`@nxgt/janus`: a lapsed token in `connectionParams` beside a live cookie is
refused, rather than rescued in silence. Fix the client's token.

`type` restricts who may connect:

```ts
janusConnection({ auth, type: 'staff' }); // a patient's session is refused
```

## What a client sees

| What happened | The client sees |
| --- | --- |
| No credential, an unknown or lapsed one, a user gone, inactive or of another `type`, an `authorization` that is not a string | The socket closed **`4403: Forbidden`**, before any operation — graphql-ws's own close for an `onConnect` that answers `false` |
| The sessions store could not answer at connect | The socket closed **`4500`**, by `graphql-ws/use/ws`, which also logs the error — **never `4403`** |
| Accepted | `connection_ack`, then operations as over HTTP |

graphql-ws's client treats `4403` as retryable — a `connectionParams`
function asked again can present a fresh token — and `4500` as fatal. Set
`retryAttempts` and `shouldRetry` on the client to change that. (`4401` is
the protocol's answer to an operation sent before the acknowledgement;
`onConnect` cannot choose it.)

## Each operation

Each operation on an accepted connection gets **a `ctx.janus` of its own**,
built by `useJanus()` as for an HTTP request, and authenticated again from
the connection's credential the first time a field asks — once per
operation, never per event:

- `@authenticated` and `@fresh` on a subscription field are checked **when
  it subscribes**. A denial answers the operation with its `GraphQLError` —
  `UNAUTHENTICATED`, `FORBIDDEN`, `STEP_UP_REQUIRED` — and the source stream
  never starts; the connection stays open.
- `@permission` on a subscription field is asked **again on every event**,
  bypassing the request's memo, so a `revoke()` stops the stream at its
  next event with `NOT_FOUND` (or `FORBIDDEN`).
- A directive on the payload's type or its fields is checked on every
  event, as any field.
- An outage at subscribe, or on an event, answers `SERVICE_UNAVAILABLE` —
  never a denial.

## A session revoked while connected

`auth.signOut` or `signOutEverywhere` while a socket is open:

- **the stream already running keeps its events coming.** Its user was
  authenticated once, when it subscribed, and each event's
  `@authenticated` reads that answer — authenticating on every event would
  cost a sessions-store read per event per subscriber;
- **the next operation on the same connection is refused**
  `UNAUTHENTICATED`, since it authenticates again;
- **a reconnection is refused `4403`**.

To cut a revoked session's streams at once, close its sockets yourself.
graphql-ws hands every callback the transport's socket as
`ctx.extra.socket`: a server that keeps its open sockets by user can close
them with `4403` when it revokes, and a client that reconnects is then
refused.

```ts
const connection = janusConnection({ auth });

useServer({
	onConnect: async (ctx) => {
		const accepted = await connection.onConnect(ctx);
		if (accepted) track(ctx.extra.socket, ctx); // your own bookkeeping, keyed as you revoke
		return accepted;
	},
	onClose: (ctx) => untrack(ctx.extra.socket),
	// … Yoga's recipe …
}, wsServer);
```

A permission revoked while connected needs none of this: `@permission` sees
it at the next event.

## Without Yoga

A server that runs graphql-ws alone passes `context` as well, and applies
the directives itself:

```ts
import { applyJanusDirectives, janusConnection } from '@nxgt/janus-graphql';
import { useServer } from 'graphql-ws/use/ws';
import { WebSocketServer } from 'ws';
import { schema } from './schema'; // your executable schema, with janusTypeDefs

const wsServer = new WebSocketServer({ port: 4000, path: '/graphql' });
const connection = janusConnection({ auth, access, clock }); // clock: the one given to janus()

useServer(
	{
		schema: applyJanusDirectives(schema, { auth, access }),
		onConnect: connection.onConnect,
		context: connection.context, // { janus } for each operation
	},
	wsServer,
);
```

With Yoga, leave `context` out: Yoga's recipe builds the context itself,
and `useJanus()`'s `access` and `clock` are the ones that apply.

## On Bun, or another transport

`onConnect` reads the upgrade request from `ctx.extra.request`, where
`graphql-ws/use/ws` and `graphql-ws/use/@fastify/websocket` put it.
`graphql-ws/use/bun`'s `extra` is `{ socket }` alone: pass the request as
the socket's `data` when you upgrade, and tell `janusConnection` where it is.

```ts
import type { ServerWebSocket } from 'bun';
import { makeHandler } from 'graphql-ws/use/bun';

type Upgraded = ServerWebSocket<{ readonly request: Request }>;

const connection = janusConnection({
	auth,
	upgrade: (ctx: { readonly extra: { readonly socket: Upgraded } }) => ctx.extra.socket.data.request,
});

Bun.serve({
	fetch: (request, server) =>
		server.upgrade(request, { data: { request } }) ? undefined : yoga.fetch(request, server),
	websocket: makeHandler({ onConnect: connection.onConnect, /* … Yoga's recipe … */ }),
});
```

Without `upgrade` on Bun, only `connectionParams` authenticates: a browser's
cookie is never read.

## What is not covered

- **An anonymous connection.** `onConnect` refuses every connection it
  cannot authenticate; serve anonymous clients over server-sent events. An
  operation on a connection no `onConnect` accepted has no credential: its
  first guarded field, or `ctx.janus.user()`, throws a `TypeError`, a 500.
- **The renewed session cookie.** A WebSocket has no response to set one
  on: renew through your HTTP routes.
