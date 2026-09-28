import { afterEach, describe, expect, it } from 'bun:test';
import { setup } from '../../test/harness';
import { codesOf, connect, listen, stream } from '../../test/socket';
import { janusConnection } from './connection';
import { resolvers, serving, stopAll, typeDefs } from './connection.fixtures';

afterEach(stopAll);

describe('janusConnection() without Yoga', () => {
	it('builds ctx.janus with context, and the directives hold', async () => {
		const s = await serving();
		const plain = await listen(s, typeDefs, resolvers, { plain: true });
		const signedIn = connect(plain.url, {
			headers: { cookie: s.cookie(s.grace.token) },
		});
		const ada = connect(plain.url, {
			headers: { cookie: s.cookie(s.ada.token) },
		});
		try {
			const rounds = await stream(signedIn.client, 'subscription { rounds }');
			expect(rounds.events).toHaveLength(2);
			const refused = await stream(ada.client, 'subscription { rounds }');
			expect(codesOf(refused)).toEqual(['FORBIDDEN']);
		} finally {
			await signedIn.client.dispose();
			await ada.client.dispose();
			await plain.close();
		}
	});
});

describe('janusConnection({ upgrade })', () => {
	it('reads the upgrade request upgrade answers, and not extra.request', async () => {
		const context = setup();
		const s = await serving(context);
		const none = await listen(context, typeDefs, resolvers, {
			upgrade: () => undefined,
		});
		const { client, closed } = connect(none.url, {
			headers: { cookie: s.cookie(s.ada.token) },
		});
		try {
			await stream(client, 'subscription { ticks }');
			expect(closed.code).toBe(4403); // the cookie was never read
		} finally {
			await client.dispose();
			await none.close();
		}
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
		expect(failure).toBeInstanceOf(TypeError);
		expect((failure as Error).message).toContain('janusConnection().onConnect');
	});
});
