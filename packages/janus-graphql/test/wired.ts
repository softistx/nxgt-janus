/**
 * What the directive and memo specs share, across subjects: the harness
 * wired with two users, an `access` that counts the checks it is asked, and
 * the wards they hold.
 */

import {
	type ServerOptions,
	type Setup,
	server,
	setup,
	users,
} from './harness';

/** `access`, asking what `context.access` answers and counting each question. */
export function counting(context: Setup) {
	const asked = { can: 0 };
	const { can } = context.access;
	const access: Setup['access'] = Object.freeze({
		...context.access,
		can: ((...args: Parameters<typeof can>) => {
			asked.can++;
			return can(...args);
		}) as typeof can,
	});
	return { access, asked };
}

/** A server over `typeDefs`, two users signed up, and a counted `access`. */
export async function wired(
	typeDefs: string,
	resolvers: object,
	options: Omit<ServerOptions, 'access'> = {},
) {
	const context = setup();
	const signedUp = await users(context);
	const { access, asked } = counting(context);
	const yoga = server(context, typeDefs, resolvers, { ...options, access });
	return { ...context, ...signedUp, yoga, asked };
}

/** A ward granted: Ada visits `w1`, Grace nurses `w1` and `w2`. */
export async function wards({
	access,
	ada,
	grace,
}: Awaited<ReturnType<typeof wired>>) {
	await access.grant({ type: 'ward', id: 'w1' }, 'visitors', ada.user);
	await access.grant({ type: 'ward', id: 'w1' }, 'nurses', grace.user);
	await access.grant({ type: 'ward', id: 'w2' }, 'nurses', grace.user);
}

/** A resolver map's key is the schema's type name. */
export type Resolvers = Record<string, Record<string, unknown>>;
