import { afterEach, describe, expect, it } from 'bun:test';
import { codesOf, stream } from '../../test/socket';
import { between, serving, stopAll } from './connection.fixtures';

afterEach(stopAll);

const ward = { type: 'ward', id: 'w1' } as const;

describe('the directives, on a graphql-ws operation', () => {
	it('denies a @permission the user does not hold, before the stream starts', async () => {
		const s = await serving();
		const { client } = s.client({ headers: { cookie: s.cookie(s.ada.token) } });
		const streamed = await stream(
			client,
			'subscription { visits(ward: "w1") }',
		);
		expect(streamed.events.filter((event) => event.data)).toEqual([]);
		expect(codesOf(streamed)).toEqual(['NOT_FOUND']);
	});

	it('asks @permission again on every event: a revoke stops the stream', async () => {
		const s = await serving();
		await s.access.grant(ward, 'visitors', s.ada.user);
		between.run = () => s.access.revoke(ward, 'visitors', s.ada.user);
		const { client } = s.client({ headers: { cookie: s.cookie(s.ada.token) } });
		const streamed = await stream(
			client,
			'subscription { visits(ward: "w1") }',
		);
		expect(streamed.events[0]).toEqual({ data: { visits: 1 } });
		expect(codesOf(streamed)).toEqual(['NOT_FOUND']); // the second event
	});

	it('refuses a @fresh subscription on an older session STEP_UP_REQUIRED', async () => {
		const s = await serving();
		const { client } = s.client({ headers: { cookie: s.cookie(s.ada.token) } });
		s.clock.advance(600_000);
		const streamed = await stream(client, 'subscription { payments }');
		expect(streamed.events.filter((event) => event.data)).toEqual([]);
		expect(codesOf(streamed)).toEqual(['STEP_UP_REQUIRED']);
	});

	it('streams a @fresh subscription on a fresh session', async () => {
		const s = await serving();
		const { client } = s.client({ headers: { cookie: s.cookie(s.ada.token) } });
		const streamed = await stream(client, 'subscription { payments }');
		expect(streamed.events).toHaveLength(2);
		expect(codesOf(streamed)).toEqual([]);
	});
});

describe('a session revoked while the connection is open', () => {
	it('lets the running stream finish, and refuses the next subscribe UNAUTHENTICATED', async () => {
		const s = await serving();
		between.run = () => s.auth.signOutEverywhere(s.ada.user);
		const { client } = s.client({ headers: { cookie: s.cookie(s.ada.token) } });
		const running = await stream(client, 'subscription { ticks }');
		expect(running.events).toEqual([
			{ data: { ticks: 1 } },
			{ data: { ticks: 2 } }, // authenticated once, when it subscribed
		]);
		const next = await stream(client, 'subscription { ticks }');
		expect(next.events.filter((event) => event.data)).toEqual([]);
		expect(codesOf(next)).toEqual(['UNAUTHENTICATED']);
	});
});
