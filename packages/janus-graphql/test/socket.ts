/**
 * A real WebSocket in process: the harness's Yoga served over graphql-ws as
 * Yoga's recipe wires it — `node:http` and `ws`'s `WebSocketServer` on a
 * free port, `useServer` with `janusConnection().onConnect` — and a
 * graphql-ws client that collects one subscription's events, its error, or
 * the code its socket was closed with.
 *
 * In `test/` beside `harness.ts`, which it extends: it serves any schema
 * the spec writes, as `server()` does over HTTP, so a directive's own spec
 * can run over a WebSocket too — not only `src/connection/`'s.
 */

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ExecutionArgs } from 'graphql';
import { type Client, createClient, type ServerOptions } from 'graphql-ws';
import { type Extra, useServer } from 'graphql-ws/use/ws';
import { createSchema } from 'graphql-yoga';
import { WebSocket, WebSocketServer } from 'ws';
import { janusConnection } from '../src/connection/connection';
import type { JanusConnectionOptions } from '../src/connection/types';
import { applyJanusDirectives } from '../src/directives/apply';
import { janusTypeDefs } from '../src/sdl';
import { type Setup, server } from './harness';

type Yoga = ReturnType<typeof server>;
type Roots = { readonly rootValue: ReturnType<Yoga['getEnveloped']> };
type Options = ServerOptions<Record<string, unknown> | undefined, Extra>;

/** How the server is wired: Yoga's recipe, or graphql-ws alone. */
export interface Listening {
	/** graphql-ws alone, with `janusConnection().context`, and no Yoga. */
	readonly plain?: boolean;
	readonly upgrade?: JanusConnectionOptions<never, never, never>['upgrade'];
	/** `janusConnection({ type })`: the one user type that may connect. */
	readonly type?: 'patient' | 'staff';
}

/** Yoga's recipe: each operation enveloped, its context built by Yoga. */
function yogaRecipe(yoga: Yoga): Options {
	return {
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
	};
}

/** A server listening on a free port, and how to stop it. */
export async function listen(
	context: Setup,
	typeDefs: string,
	resolvers: object,
	{ plain = false, upgrade, type }: Listening = {},
) {
	const yoga = server(context, typeDefs, resolvers);
	const http = createServer(yoga);
	const sockets = new WebSocketServer({
		server: http,
		path: yoga.graphqlEndpoint,
	});
	const { tracked: auth, access, clock } = context;
	const connection = janusConnection({
		auth,
		access,
		clock,
		...(upgrade === undefined ? {} : { upgrade }),
		...(type === undefined ? {} : { type }),
	});
	const wiring: Options = plain
		? {
				schema: applyJanusDirectives(
					createSchema({
						typeDefs: [janusTypeDefs, typeDefs],
						resolvers: resolvers as never,
					}),
					{ auth, access },
				),
				context: connection.context,
			}
		: yogaRecipe(yoga);
	const disposable = useServer(
		{ onConnect: connection.onConnect, ...wiring },
		sockets,
	);
	await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
	const { port } = http.address() as AddressInfo;
	return {
		url: `ws://127.0.0.1:${port}${yoga.graphqlEndpoint}`,
		/** Closes every socket, then the server. */
		close: async () => {
			await disposable.dispose();
			await new Promise<void>((resolve) => sockets.close(() => resolve()));
			await new Promise<void>((resolve) => http.close(() => resolve()));
		},
	};
}

/** How a client connects: its `connectionParams`, and the upgrade's headers. */
export interface Connecting {
	readonly connectionParams?: Record<string, unknown>;
	readonly headers?: Record<string, string>;
}

/** A graphql-ws client that never retries, its upgrade sent with `headers`. */
export function connect(url: string, connecting: Connecting = {}) {
	const { connectionParams, headers = {} } = connecting;
	const closed: { code?: number } = {};
	const client = createClient({
		url,
		retryAttempts: 0,
		lazy: true,
		// One socket for every operation of a case, closed by `dispose()`.
		lazyCloseTimeout: 60_000,
		...(connectionParams === undefined ? {} : { connectionParams }),
		webSocketImpl: class extends WebSocket {
			constructor(address: string, protocols: string | string[]) {
				super(address, protocols, { headers });
			}
		},
		on: {
			closed: (event) => {
				closed.code = (event as { readonly code: number }).code;
			},
		},
	});
	return { client, closed };
}

/** What one subscription answered before it completed or failed. */
export interface Streamed {
	readonly events: readonly {
		readonly data?: unknown | undefined;
		readonly errors?: readonly unknown[] | undefined;
	}[];
	/** A close event, or the GraphQL errors the stream ended with. */
	readonly failure?: unknown;
}

/** Runs `query` to its end on `client`: its events, and how it failed. */
export function stream(client: Client, query: string): Promise<Streamed> {
	const events: Streamed['events'][number][] = [];
	return new Promise((resolve) => {
		client.subscribe(
			{ query },
			{
				next: (result) => events.push(result),
				error: (failure) => resolve({ events, failure }),
				complete: () => resolve({ events }),
			},
		);
	});
}

/**
 * The codes of every error a stream answered, in order: those its events
 * carried, then those it failed with.
 */
export function codesOf({ events, failure }: Streamed): unknown[] {
	const failed = Array.isArray(failure) ? failure : [];
	return [...events.flatMap((event) => event.errors ?? []), ...failed].map(
		(error) =>
			(error as { readonly extensions?: { readonly code?: unknown } })
				.extensions?.code,
	);
}
