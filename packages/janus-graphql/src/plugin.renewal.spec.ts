import { describe, expect, it } from 'bun:test';
import { createSchema, createYoga } from 'graphql-yoga';
import {
	type Context,
	type Setup,
	server,
	setup,
	users,
} from '../test/harness';
import { useJanus } from './plugin';
import { janusTypeDefs } from './sdl';

const DAY = 24 * 60 * 60 * 1000;

const typeDefs = /* GraphQL */ `
	type Query {
		me: String @authenticated
		open: String
	}
`;

const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Query: {
		me: async (_: unknown, __: unknown, ctx: Context) =>
			(await ctx.janus.user())?.id ?? null,
		open: () => 'open',
	},
};

/** A signed-up patient, and a Yoga server over the schema above. */
async function app() {
	const context = setup();
	const { ada } = await users(context);
	return { ...context, ada, yoga: server(context, typeDefs, resolvers) };
}

/** One query, with the headers given: the response, as Yoga answered it. */
function post(
	{ yoga }: { readonly yoga: ReturnType<typeof server> },
	query: string,
	headers: Record<string, string> = {},
) {
	return yoga.fetch('http://yoga.test/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query }),
	});
}

const cookie = (auth: Setup['auth'], token: string) => ({
	cookie: `theme=dark; ${auth.cookie.name}=${token}`,
});

describe('useJanus(): a renewed session', () => {
	it('is sent again as a cookie, with its new expiry, to a request that presented one', async () => {
		const served = await app();
		const { auth, clock, ada } = served;
		clock.advance(DAY + 1);

		const response = await post(served, '{ me }', cookie(auth, ada.token));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: { me: ada.user.id } });
		const sent = response.headers.getSetCookie();
		expect(sent).toHaveLength(1);
		const renewed = await auth.authenticate(cookie(auth, ada.token));
		expect(renewed?.session.expiresAt.getTime()).toBe(
			clock.now().getTime() + 7 * DAY,
		);
		expect(sent[0]).toBe(
			auth.cookie.serialize(ada.token, renewed?.session as never),
		);
	});

	it('sends nothing when the session was not renewed', async () => {
		const served = await app();
		const { auth, ada } = served;
		const response = await post(served, '{ me }', cookie(auth, ada.token));
		expect(await response.json()).toEqual({ data: { me: ada.user.id } });
		expect(response.headers.getSetCookie()).toEqual([]);
	});

	it('hands no cookie to a bearer token or X-Session-Token', async () => {
		for (const headers of [
			(token: string) => ({ authorization: `Bearer ${token}` }),
			(token: string) => ({ 'x-session-token': token }),
		]) {
			const served = await app();
			const { auth, clock, ada, calls } = served;
			clock.advance(DAY + 1);
			const response = await post(served, '{ me }', headers(ada.token));
			expect(await response.json()).toEqual({ data: { me: ada.user.id } });
			expect(calls.authenticate).toBe(1);
			expect(response.headers.getSetCookie()).toEqual([]);
			// It was renewed all the same: the next read is not.
			const next = await auth.authenticate(headers(ada.token));
			expect(next?.renewed).toBe(false);
		}
	});

	it('sends nothing to an anonymous request, or one whose session nothing read', async () => {
		const served = await app();
		const { auth, clock, ada, calls } = served;
		clock.advance(DAY + 1);

		const anonymous = await post(served, '{ open me }');
		expect(anonymous.headers.getSetCookie()).toEqual([]);

		const unread = await post(served, '{ open }', cookie(auth, ada.token));
		expect(await unread.json()).toEqual({ data: { open: 'open' } });
		expect(calls.authenticate).toBe(1); // the anonymous one only
		expect(unread.headers.getSetCookie()).toEqual([]);
	});

	it('sends nothing on an outage, which is answered 503', async () => {
		const served = await app();
		const { auth, clock, ada, outage } = served;
		clock.advance(DAY + 1);
		outage.sessions = true;
		const response = await post(served, '{ me }', cookie(auth, ada.token));
		expect(response.status).toBe(503);
		expect(response.headers.getSetCookie()).toEqual([]);
	});

	it('is sent once for a batch of operations', async () => {
		const context = setup();
		const { ada } = await users(context);
		const yoga = createYoga({
			schema: createSchema({
				typeDefs: [janusTypeDefs, typeDefs],
				resolvers: resolvers as never,
			}),
			plugins: [useJanus({ auth: context.tracked, clock: context.clock })],
			batching: true,
			logging: false,
		});
		context.clock.advance(DAY + 1);
		const response = await yoga.fetch('http://yoga.test/graphql', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...cookie(context.auth, ada.token),
			},
			body: JSON.stringify([{ query: '{ me }' }, { query: '{ me }' }]),
		});
		expect(await response.json()).toEqual([
			{ data: { me: ada.user.id } },
			{ data: { me: ada.user.id } },
		]);
		expect(response.headers.getSetCookie()).toHaveLength(1);
	});

	it('never overwrites a session cookie the response already sets', async () => {
		const context = setup();
		const { ada } = await users(context);
		const name = context.auth.cookie.name;
		const yoga = createYoga({
			schema: createSchema({
				typeDefs: [janusTypeDefs, typeDefs],
				resolvers: resolvers as never,
			}),
			plugins: [
				// A sign-out of the application's own, set before useJanus() answers.
				{
					onResponse: ({ response }: { response: Response }) => {
						response.headers.append('Set-Cookie', `${name}=; Max-Age=0`);
					},
				},
				useJanus({ auth: context.tracked, clock: context.clock }),
			],
			logging: false,
		});
		context.clock.advance(DAY + 1);
		const response = await post(
			{ yoga },
			'{ me }',
			cookie(context.auth, ada.token),
		);
		expect(await response.json()).toEqual({ data: { me: ada.user.id } });
		expect(response.headers.getSetCookie()).toEqual([`${name}=; Max-Age=0`]);
	});

	it('sends nothing for an auth without cookie, and answers all the same', async () => {
		const context = setup();
		const { ada } = await users(context);
		const { types, authenticate } = context.auth;
		const yoga = createYoga({
			schema: createSchema({
				typeDefs: [janusTypeDefs, typeDefs],
				resolvers: resolvers as never,
			}),
			plugins: [
				useJanus({ auth: { types, authenticate }, clock: context.clock }),
			],
			logging: false,
		});
		context.clock.advance(DAY + 1);
		const response = await post(
			{ yoga },
			'{ me }',
			cookie(context.auth, ada.token),
		);
		expect(await response.json()).toEqual({ data: { me: ada.user.id } });
		expect(response.headers.getSetCookie()).toEqual([]);
		const next = await context.auth.authenticate(
			cookie(context.auth, ada.token),
		);
		expect(next?.renewed).toBe(false); // renewed in the store all the same
	});
});
