import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import {
	type JanusError,
	NotFoundError,
	PermissionDepthError,
	StoreFailure,
} from '@nxgt/janus';
import { GraphQLError } from 'graphql';
import {
	ask,
	type Context,
	codes,
	type Setup,
	server,
	setup,
	users,
} from '../test/harness';
import { janusMaskError } from './errors';
import { can, requireUser } from './helpers';

const typeDefs = /* GraphQL */ `
	type Query {
		guarded: String @authenticated
		other: String @authenticated
		ward(id: ID!): String @permission(name: "enter", type: "ward")
		required: String
		record: String
		missing: String
	}
`;

const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Query: {
		guarded: () => 'guarded',
		other: () => 'other',
		ward: (_: unknown, { id }: { id: string }) => id,
		required: async (_: unknown, __: unknown, ctx: Context) =>
			(await requireUser(ctx)).id,
		record: async (_: unknown, __: unknown, ctx: Context) =>
			(await can(ctx, 'view', { type: 'record', id: 'r1', doctorId: null }))
				? 'Blood test'
				: null,
		missing: () => {
			throw new NotFoundError('no such record');
		},
	},
};

/** A server whose mask reports into `reported`, with `report` in its place when given. */
async function reporting(report?: (error: JanusError) => unknown) {
	const context = setup();
	const signedUp = await users(context);
	const reported: JanusError[] = [];
	const yoga = server(context, typeDefs, resolvers, {
		report:
			report ??
			((error) => {
				reported.push(error);
			}),
	});
	return { ...context, ...signedUp, yoga, reported };
}

const down = (context: Setup, store: 'sessions' | 'relations') => {
	context.outage[store] = true;
};

describe('janusMaskError({ report })', () => {
	let warning: ReturnType<typeof spyOn> | undefined;
	afterEach(() => warning?.mockRestore());

	for (const [field, store] of [
		['guarded', 'sessions'],
		['required', 'sessions'],
		['ward(id: "w1")', 'relations'],
		['record', 'relations'],
	] as const) {
		it(`reports ${field}'s STORE_FAILED once, and answers it 503`, async () => {
			const context = await reporting();
			down(context, store);
			const { status, body } = await ask(
				context.yoga,
				`{ ${field} }`,
				context.ada.token,
			);
			expect(status).toBe(503);
			expect(codes(body)).toEqual(['SERVICE_UNAVAILABLE']);
			expect(context.reported).toHaveLength(1);
			expect(context.reported[0]).toBeInstanceOf(StoreFailure);
			expect(context.reported[0]?.code).toBe('STORE_FAILED');
		});
	}

	it('reports one outage once, however many fields it failed', async () => {
		const context = await reporting();
		down(context, 'sessions');
		const { body } = await ask(
			context.yoga,
			'{ guarded other required }',
			context.ada.token,
		);
		expect(codes(body)).toEqual([
			'SERVICE_UNAVAILABLE',
			'SERVICE_UNAVAILABLE',
			'SERVICE_UNAVAILABLE',
		]);
		expect(context.reported).toHaveLength(1);
	});

	it('reports no 4xx, and no denial', async () => {
		const context = await reporting();
		const { body } = await ask(context.yoga, '{ missing guarded required }');
		expect(codes(body)).toEqual([
			'NOT_FOUND',
			'UNAUTHENTICATED',
			'UNAUTHENTICATED',
		]);
		expect(context.reported).toEqual([]);
	});

	for (const [how, report] of [
		[
			'throws',
			() => {
				throw new Error('logger down');
			},
		],
		['rejects', () => Promise.reject(new Error('logger down'))],
	] as const) {
		it(`answers 503 all the same when report ${how}, with a warning`, async () => {
			warning = spyOn(process, 'emitWarning').mockImplementation(() => {});
			const context = await reporting(report);
			down(context, 'sessions');
			const { status, body } = await ask(
				context.yoga,
				'{ guarded }',
				context.ada.token,
			);
			expect(status).toBe(503);
			expect(codes(body)).toEqual(['SERVICE_UNAVAILABLE']);
			await Promise.resolve();
			expect(warning).toHaveBeenCalledWith(
				'janusMaskError: report failed on STORE_FAILED: Error',
			);
		});
	}
});

describe('janusMaskError(), called directly', () => {
	it('reports every 5xx code — PERMISSION_DEPTH too — and answers as without it', () => {
		const reported: JanusError[] = [];
		const mask = janusMaskError({ report: (error) => reported.push(error) });
		const depth = new PermissionDepthError('view walked past 25', {
			permission: 'view',
			maxDepth: 25,
		});
		const answer = mask(depth, 'Unexpected error.') as GraphQLError;
		const plain = janusMaskError()(depth, 'Unexpected error.') as GraphQLError;
		expect(answer.message).toBe(plain.message);
		expect(answer.extensions).toEqual(plain.extensions);
		expect(reported).toEqual([depth]);
	});

	it('takes its fallback alone, as before, or among the options', () => {
		const fallback = (_: unknown, message: string) =>
			new GraphQLError(`fallback: ${message}`);
		for (const mask of [
			janusMaskError(fallback),
			janusMaskError({ fallback }),
		]) {
			expect(mask(new Error('boom'), 'Unexpected error.').message).toBe(
				'fallback: Unexpected error.',
			);
		}
	});
});
