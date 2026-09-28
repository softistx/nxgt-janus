/**
 * `janus()` and `permissions()` wired the way an application wires them —
 * Zod, scrypt, the reference stores, `createMemoryRelations()` — with a switch
 * per store that takes it down and a count of `authenticate` calls, and a Yoga
 * server over a schema the spec writes, answered in process by `yoga.fetch`.
 */

import {
	createMemoryStores,
	fixedClock,
	janus,
	StoreFailure,
	scryptHasher,
} from '@nxgt/janus';
import {
	type ConfigOf,
	createMemoryRelations,
	defineModel,
	fromField,
	permissions,
	when,
} from '@nxgt/janus/permissions';
import {
	createSchema,
	createYoga,
	type YogaInitialContext,
} from 'graphql-yoga';
import { z } from 'zod';
import { janusMaskError } from '../src/errors';
import { useJanus } from '../src/plugin';
import { janusTypeDefs } from '../src/sdl';
import type { JanusContext } from '../src/types';
import type { Conditions, Loaders } from '../src/wiring';

export const password = 'correct horse';

export function setup() {
	const clock = fixedClock(Date.UTC(2026, 8, 24));
	const stores = createMemoryStores();
	const outage = { sessions: false, relations: false };
	const find = stores.sessions.findSessionByTokenHash.bind(stores.sessions);

	const auth = janus({
		users: {
			patient: {
				schema: z.strictObject({ email: z.email(), name: z.string() }),
				password: { login: 'email' },
			},
			staff: {
				schema: z.strictObject({ username: z.string() }),
				password: { login: 'username' },
			},
		},
		store: {
			...stores,
			sessions: {
				...stores.sessions,
				findSessionByTokenHash: (hash) => {
					if (outage.sessions) throw new StoreFailure('connection refused');
					return find(hash);
				},
			},
		},
		hasher: scryptHasher({ cost: 10 }),
		clock,
	});
	// What useJanus() is given: the instance's types, and an authenticate that
	// counts its calls.
	const calls = { authenticate: 0, has: 0 };
	const tracked: Pick<typeof auth, 'authenticate' | 'types'> = {
		types: auth.types,
		authenticate: ((request, options) => {
			calls.authenticate++;
			return auth.authenticate(request, options);
		}) as typeof auth.authenticate,
	};

	const model = defineModel({
		subjects: auth.types,
		types: {
			record: {
				related: {
					owners: ['patient'],
					doctors: fromField('doctorId', 'staff'),
				},
				permits: {
					view: ['owners', 'doctors'],
					edit: [when('owners', (ctx: { locked: boolean }) => !ctx.locked)],
				},
			},
			ward: {
				related: { nurses: ['staff'], visitors: ['patient'] },
				permits: { enter: ['nurses', 'visitors'], manage: ['nurses'] },
			},
		},
	});
	const relations = createMemoryRelations();
	const has = relations.has.bind(relations);
	const access = permissions({
		model,
		store: {
			...relations,
			has: (tuple) => {
				calls.has++;
				if (outage.relations) throw new StoreFailure('connection refused');
				return has(tuple);
			},
		},
	});

	return { auth, tracked, access, clock, outage, calls };
}

export type Setup = ReturnType<typeof setup>;
export type Context = YogaInitialContext &
	JanusContext<Setup['auth'], Setup['access']>;

/** A patient and a staff member signed up, with a session token each. */
export async function users({ auth }: Setup) {
	const ada = await auth.patient.signUp({
		email: 'ada@example.test',
		name: 'Ada Lovelace',
		password,
	});
	const grace = await auth.staff.signUp({ username: 'grace', password });
	return { ada, grace };
}

/** What `server()` takes beside the schema: `useJanus()`'s permission wiring, and the masking. */
export interface ServerOptions {
	readonly masked?: boolean;
	/** In place of `context.access`: a wrapped instance. */
	readonly access?: Setup['access'];
	readonly loaders?: Loaders<ConfigOf<Setup['access']['model']>, unknown>;
	readonly conditions?: Conditions<ConfigOf<Setup['access']['model']>, unknown>;
}

/** A Yoga server over `typeDefs` and `resolvers`, wired as the README shows. */
export function server(
	context: Setup,
	typeDefs: string,
	resolvers: object,
	options: ServerOptions = {},
) {
	return createYoga({
		schema: createSchema({
			typeDefs: [janusTypeDefs, typeDefs],
			resolvers: resolvers as never,
		}),
		plugins: [
			useJanus({
				auth: context.tracked,
				access: options.access ?? context.access,
				...(options.loaders === undefined ? {} : { loaders: options.loaders }),
				...(options.conditions === undefined
					? {}
					: { conditions: options.conditions }),
			}),
		],
		maskedErrors:
			options.masked === false ? false : { maskError: janusMaskError() },
		logging: false,
	});
}

/** The answer of one query: its status, and its body. */
export async function ask(
	yoga: ReturnType<typeof server>,
	query: string,
	token?: string,
	variables?: Record<string, unknown>,
): Promise<{ status: number; body: GraphQLBody }> {
	const response = await yoga.fetch('http://yoga.test/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
		},
		body: JSON.stringify({ query, variables }),
	});
	return { status: response.status, body: (await response.json()) as never };
}

export interface GraphQLBody {
	readonly data?: Record<string, unknown> | null;
	readonly errors?: readonly {
		readonly message: string;
		readonly path?: readonly (string | number)[];
		readonly extensions?: Record<string, unknown>;
	}[];
}

/** The codes of a body's errors, in order. */
export function codes(body: GraphQLBody): unknown[] {
	return (body.errors ?? []).map((error) => error.extensions?.code);
}
