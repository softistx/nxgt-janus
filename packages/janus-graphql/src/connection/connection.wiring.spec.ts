import { afterEach, describe, expect, it } from 'bun:test';
import { setup, users } from '../../test/harness';
import { codesOf, stream } from '../../test/socket';
import { janusConnection } from './connection';
import { serving, stopAll } from './connection.fixtures';

afterEach(stopAll);

describe('janusConnection() without Yoga', () => {
	it('builds ctx.janus with context, and the directives hold', async () => {
		const s = await serving(setup(), { plain: true });
		const grace = s.client({ headers: { cookie: s.cookie(s.grace.token) } });
		const ada = s.client({ headers: { cookie: s.cookie(s.ada.token) } });
		const rounds = await stream(grace.client, 'subscription { rounds }');
		expect(rounds.events).toHaveLength(2);
		const refused = await stream(ada.client, 'subscription { rounds }');
		expect(codesOf(refused)).toEqual(['FORBIDDEN']);
	});
});

describe('janusConnection({ upgrade })', () => {
	it('reads the upgrade request upgrade answers, and not extra.request', async () => {
		const s = await serving(setup(), { upgrade: () => undefined });
		const { client, closed } = s.client({
			headers: { cookie: s.cookie(s.ada.token) },
		});
		await stream(client, 'subscription { ticks }');
		expect(closed.code).toBe(4403); // the cookie was never read
	});

	it('accepts the connection when the request it answers authenticates', async () => {
		// As on Bun: the request kept elsewhere than extra.request.
		const kept: { request?: Headers } = {};
		const s = await serving(setup(), { upgrade: () => kept.request });
		kept.request = new Headers({ authorization: `Bearer ${s.grace.token}` });
		const { client } = s.client();
		const streamed = await stream(client, 'subscription { rounds }');
		expect(streamed.events).toHaveLength(2);
	});
});

describe('janusConnection() refuses its wiring', () => {
	const { auth, access } = setup();

	it('an auth that is not what janus() answered', () => {
		expect(() => janusConnection({ auth: access as never })).toThrow(
			new TypeError(
				'janusConnection(): auth is not what janus() answered — pass { auth }',
			),
		);
	});

	it('an upgrade that is not a function', () => {
		expect(() =>
			janusConnection({ auth, upgrade: 'request' as never }),
		).toThrow(
			new TypeError(
				'janusConnection(): upgrade is not a function — pass (ctx) => the upgrade request, or leave it out to read ctx.extra.request',
			),
		);
	});

	it('a context no onConnect accepted, when a field asks', async () => {
		const connection = janusConnection({ auth });
		const { janus } = connection.context({ extra: {} });
		const failure = await janus.user().then(
			() => null,
			(error: unknown) => error,
		);
		expect(failure).toEqual(
			new TypeError(
				'janusConnection().context: the GraphQL context has no request to authenticate — build the context from an HTTP request, or accept a graphql-ws connection with janusConnection().onConnect',
			),
		);
	});

	it('an onConnect called with an extra that is not an object, once it accepts', async () => {
		const context = setup();
		const { ada } = await users(context);
		const connection = janusConnection({ auth: context.auth });
		const failure = await connection
			.onConnect({
				connectionParams: { authorization: `Bearer ${ada.token}` },
				extra: 'socket',
			})
			.then(
				() => null,
				(error: unknown) => error,
			);
		expect(failure).toEqual(
			new TypeError(
				"janusConnection(): the connection's extra is not an object — pass the context graphql-ws gave onConnect",
			),
		);
	});
});
