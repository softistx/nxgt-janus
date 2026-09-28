/**
 * What the graphql-ws specs share: a schema with a stream per directive,
 * served over a real WebSocket, and two users signed up. Each case starts
 * its own server; `stopAll`, in each spec file's `afterEach`, disposes of
 * its clients, then stops it.
 */

import { type Setup, setup, users } from '../../test/harness';
import { type Connecting, connect, listen } from '../../test/socket';

/** What `stopAll` stops, clients first. */
const running: (() => Promise<void> | void)[] = [];

/** Disposes of every client, then stops every server, of the case. */
export async function stopAll() {
	for (const stop of running.splice(0).reverse()) await stop();
}

export const typeDefs = /* GraphQL */ `
	type Query {
		open: String
	}
	type Subscription {
		ticks: Int @authenticated
		rounds: Int @authenticated(type: ["staff"])
		payments: Int @fresh(maxAge: 600)
		visits(ward: ID!): Int
			@permission(name: "enter", type: "ward", id: "args.ward")
	}
`;

/** What a stream runs between its first event and its second. */
export const between: { run?: () => Promise<unknown> } = {};

/** Two events, `between.run` awaited in between. */
function twoEvents(field: string) {
	return async function* () {
		yield { [field]: 1 };
		await between.run?.();
		yield { [field]: 2 };
	};
}

export const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Subscription: Object.fromEntries(
		['ticks', 'rounds', 'payments', 'visits'].map((field) => [
			field,
			{ subscribe: twoEvents(field) },
		]),
	),
};

/** A server over the schema, two users, and the cookie each would send. */
export async function serving(context: Setup = setup()) {
	delete between.run;
	const signedUp = await users(context);
	const listening = await listen(context, typeDefs, resolvers);
	running.push(listening.close);
	const cookie = (token: string) => `${context.auth.cookie.name}=${token}`;
	/** A client of this server, disposed of by `stopAll`. */
	const client = (connecting?: Connecting) => {
		const connected = connect(listening.url, connecting);
		running.push(() => connected.client.dispose());
		return connected;
	};
	return { ...context, ...signedUp, cookie, client };
}
