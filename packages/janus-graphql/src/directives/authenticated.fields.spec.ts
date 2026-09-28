import { describe, expect, it } from 'bun:test';
import { buildSchema } from 'graphql';
import {
	ask,
	type Context,
	codes,
	server,
	setup,
	users,
} from '../../test/harness';
import { janusTypeDefs } from '../sdl';
import { applyJanusDirectives } from './apply';

const typeDefs = /* GraphQL */ `
	type Query {
		open: String
		me: String @authenticated
		roster: [String!] @authenticated(type: ["staff"])
		either: String @authenticated(type: ["patient", "staff"])
	}
`;

async function wired() {
	const context = setup();
	const signedUp = await users(context);
	const ran: string[] = [];
	const resolvers = {
		// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
		Query: {
			open: () => 'open',
			me: async (_: unknown, __: unknown, ctx: Context) => {
				ran.push('me');
				return (await ctx.janus.user())?.id ?? null;
			},
			roster: () => {
				ran.push('roster');
				return ['grace'];
			},
			either: () => 'either',
		},
	};
	return { yoga: server(context, typeDefs, resolvers), ran, ...signedUp };
}

describe('@authenticated on a field', () => {
	it('lets an anonymous request read a field it does not guard', async () => {
		const { yoga } = await wired();
		const { status, body } = await ask(yoga, '{ open }');
		expect(status).toBe(200);
		expect(body).toEqual({ data: { open: 'open' } });
	});

	it('answers an anonymous request UNAUTHENTICATED, 401, and never runs the resolver', async () => {
		const { yoga, ran } = await wired();
		const { status, body } = await ask(yoga, '{ me }');
		expect(ran).toEqual([]);
		expect(status).toBe(401);
		expect(codes(body)).toEqual(['UNAUTHENTICATED']);
		expect(body.errors?.[0]?.path).toEqual(['me']);
		expect(body.data).toEqual({ me: null });
	});

	it('runs the resolver for a signed-in user', async () => {
		const { yoga, ada } = await wired();
		const { status, body } = await ask(yoga, '{ me }', ada.token);
		expect(status).toBe(200);
		expect(body).toEqual({ data: { me: ada.user.id } });
	});

	it('answers a user of another type FORBIDDEN, 403', async () => {
		const { yoga, ran, ada, grace } = await wired();
		const refused = await ask(yoga, '{ roster }', ada.token);
		expect(ran).toEqual([]);
		expect(refused.status).toBe(403);
		expect(codes(refused.body)).toEqual(['FORBIDDEN']);

		const allowed = await ask(yoga, '{ roster }', grace.token);
		expect(allowed.body).toEqual({ data: { roster: ['grace'] } });
	});

	it('admits a user of any type the list names', async () => {
		const { yoga, ada, grace } = await wired();
		for (const { token } of [ada, grace]) {
			expect((await ask(yoga, '{ either }', token)).body).toEqual({
				data: { either: 'either' },
			});
		}
	});

	it('answers the other fields of the same query, and refuses only the guarded one', async () => {
		const { yoga } = await wired();
		const { status, body } = await ask(yoga, '{ open me }');
		expect(status).toBe(401); // Yoga answers the highest status among the errors
		expect(body.data).toEqual({ open: 'open', me: null });
		expect(codes(body)).toEqual(['UNAUTHENTICATED']);
	});
});

describe('@authenticated refused when the schema is built', () => {
	const auth = { types: ['patient', 'staff'] as const };
	const build = (sdl: string) =>
		applyJanusDirectives(buildSchema(janusTypeDefs + sdl), { auth });

	it('names the field of a user type auth does not know', () => {
		expect(() =>
			build('type Query { me: String @authenticated(type: ["doctor"]) }'),
		).toThrow(
			new TypeError(
				"applyJanusDirectives(): @authenticated on Query.me names the user type 'doctor', which is not one of 'patient', 'staff'",
			),
		);
	});

	it('refuses type: [], which no user could pass', () => {
		expect(() =>
			build('type Query { me: String @authenticated(type: []) }'),
		).toThrow(/@authenticated on Query\.me names no user type/);
	});

	it('refuses a user type useJanus({ type }) leaves out', () => {
		const schema = buildSchema(
			`${janusTypeDefs}type Query { me: String @authenticated(type: ["patient"]) }`,
		);
		expect(() => applyJanusDirectives(schema, { auth, type: 'staff' })).toThrow(
			/names the user type 'patient', which is not one of 'staff'/,
		);
	});
});
