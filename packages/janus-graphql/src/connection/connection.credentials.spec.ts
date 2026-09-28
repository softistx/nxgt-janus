import { afterEach, describe, expect, it } from 'bun:test';
import { codesOf, stream } from '../../test/socket';
import { serving, stopAll } from './connection.fixtures';

afterEach(stopAll);

describe('janusConnection() over a real WebSocket', () => {
	it('accepts the session cookie the upgrade request carries', async () => {
		const s = await serving();
		const { client } = s.client({ headers: { cookie: s.cookie(s.ada.token) } });
		const streamed = await stream(client, 'subscription { ticks }');
		expect(streamed.events).toEqual([
			{ data: { ticks: 1 } },
			{ data: { ticks: 2 } },
		]);
		expect(streamed.failure).toBeUndefined();
	});

	it("accepts a bearer token in connectionParams' authorization", async () => {
		const s = await serving();
		const { client } = s.client({
			connectionParams: { authorization: `Bearer ${s.ada.token}` },
		});
		const streamed = await stream(client, 'subscription { ticks }');
		expect(streamed.events).toHaveLength(2);
	});

	it('refuses an anonymous connection 4403, before any operation', async () => {
		const s = await serving();
		const { client, closed } = s.client();
		const streamed = await stream(client, 'subscription { ticks }');
		expect(streamed.events).toEqual([]);
		expect(closed.code).toBe(4403);
		expect(s.calls.authenticate).toBe(1); // the upgrade request, with no credential
	});

	it('refuses an unknown token 4403', async () => {
		const s = await serving();
		const { client, closed } = s.client({
			connectionParams: { authorization: 'Bearer not-a-session' },
		});
		await stream(client, 'subscription { ticks }');
		expect(closed.code).toBe(4403);
	});

	it('refuses an authorization that is not a string 4403, without asking', async () => {
		const s = await serving();
		const { client, closed } = s.client({
			connectionParams: { authorization: { token: s.ada.token } },
		});
		await stream(client, 'subscription { ticks }');
		expect(closed.code).toBe(4403);
		expect(s.calls.authenticate).toBe(0);
	});

	it('reads connectionParams first: a lapsed token beside a live cookie is refused', async () => {
		const s = await serving();
		const { client, closed } = s.client({
			connectionParams: { authorization: 'Bearer lapsed' },
			headers: { cookie: s.cookie(s.ada.token) },
		});
		await stream(client, 'subscription { ticks }');
		expect(closed.code).toBe(4403);
	});

	it('authenticates each operation again, from the credential it connected with', async () => {
		const s = await serving();
		const { client } = s.client({
			headers: { cookie: s.cookie(s.grace.token) },
		});
		await stream(client, 'subscription { ticks }');
		const connected = s.calls.authenticate;
		const rounds = await stream(client, 'subscription { rounds }');
		expect(rounds.events).toHaveLength(2);
		expect(s.calls.authenticate).toBe(connected + 1); // once per operation
	});

	it('answers a user of another type FORBIDDEN on a field that names one', async () => {
		const s = await serving();
		const { client } = s.client({ headers: { cookie: s.cookie(s.ada.token) } });
		const streamed = await stream(client, 'subscription { rounds }');
		expect(codesOf(streamed)).toEqual(['FORBIDDEN']);
	});
});
