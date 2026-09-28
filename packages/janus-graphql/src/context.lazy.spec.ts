import { describe, expect, it } from 'bun:test';
import { ask, type Context, server, setup, users } from '../test/harness';
import { createJanusContext } from './context';

const typeDefs = /* GraphQL */ `
	type Query {
		open: String
		who: String
		expires: String
		guarded: String @authenticated
		twice: String @authenticated
	}
`;

const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Query: {
		open: () => 'open',
		who: async (_: unknown, __: unknown, ctx: Context) =>
			(await ctx.janus.user())?.type ?? 'anonymous',
		expires: async (_: unknown, __: unknown, ctx: Context) =>
			(await ctx.janus.session())?.expiresAt.toISOString() ?? null,
		guarded: () => 'guarded',
		twice: () => 'twice',
	},
};

async function wired() {
	const context = setup();
	const signedUp = await users(context);
	return {
		...context,
		...signedUp,
		yoga: server(context, typeDefs, resolvers),
	};
}

describe('ctx.janus', () => {
	it('never authenticates a request that asks nothing of it', async () => {
		const { yoga, calls, ada } = await wired();
		await ask(yoga, '{ open }', ada.token);
		expect(calls.authenticate).toBe(0);
	});

	it('authenticates once per request, however many fields ask', async () => {
		const { yoga, calls, ada } = await wired();
		const { body } = await ask(
			yoga,
			'{ who expires guarded twice }',
			ada.token,
		);
		expect(body.data).toEqual({
			who: 'patient',
			expires: ada.session.expiresAt.toISOString(),
			guarded: 'guarded',
			twice: 'twice',
		});
		expect(calls.authenticate).toBe(1);

		await ask(yoga, '{ who }', ada.token);
		expect(calls.authenticate).toBe(2);
	});

	it('answers null for an anonymous request, user and session alike', async () => {
		const { yoga } = await wired();
		const { body } = await ask(yoga, '{ who expires }');
		expect(body).toEqual({ data: { who: 'anonymous', expires: null } });
	});

	it('treats a user of another type as anonymous under useJanus({ type })', async () => {
		const { auth, ada, grace } = await wired();
		const request = (token: string) =>
			new Request('http://yoga.test/graphql', {
				headers: { authorization: `Bearer ${token}` },
			});
		const staffOnly = { auth, type: 'staff' };
		expect(
			await createJanusContext(request(ada.token), staffOnly).user(),
		).toBeNull();
		expect(
			(await createJanusContext(request(grace.token), staffOnly).user())?.id,
		).toBe(grace.user.id);
	});

	it('refuses with a TypeError a context built with no request', async () => {
		const { auth } = await wired();
		const janus = createJanusContext(undefined, { auth });
		const failure = await janus.user().then(
			() => null,
			(error: unknown) => error,
		);
		expect(failure).toBeInstanceOf(TypeError);
		expect((failure as Error).message).toContain('no request to authenticate');
	});

	it('has no access unless useJanus() was given one', async () => {
		const { auth, access } = await wired();
		const request = new Request('http://yoga.test/graphql');
		expect('access' in createJanusContext(request, { auth })).toBe(false);
		expect(createJanusContext(request, { auth, access }).access).toBe(access);
	});
});
