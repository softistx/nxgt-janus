import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { codesOf, stream } from '../../test/socket';
import { serving, stopAll } from './connection.fixtures';

afterEach(stopAll);

describe('an outage, over graphql-ws', () => {
	it('closes the connection 4500 when the sessions store cannot answer at connect — never 4403', async () => {
		// `graphql-ws/use/ws` logs what an onConnect threw before it closes.
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const s = await serving();
			s.outage.sessions = true;
			const { client, closed } = s.client({
				headers: { cookie: s.cookie(s.ada.token) },
			});
			const streamed = await stream(client, 'subscription { ticks }');
			expect(streamed.events).toEqual([]);
			expect(closed.code).toBe(4500);
			expect(logged).toHaveBeenCalled();
		} finally {
			logged.mockRestore();
		}
	});

	it('answers SERVICE_UNAVAILABLE when it cannot answer at subscribe — never UNAUTHENTICATED', async () => {
		const s = await serving();
		const { client, closed } = s.client({
			headers: { cookie: s.cookie(s.ada.token) },
		});
		expect(
			(await stream(client, 'subscription { ticks }')).events,
		).toHaveLength(2);
		s.outage.sessions = true;
		const streamed = await stream(client, 'subscription { ticks }');
		expect(streamed.events.filter((event) => event.data)).toEqual([]);
		expect(codesOf(streamed)).toEqual(['SERVICE_UNAVAILABLE']);
		expect(closed.code).toBeUndefined(); // the connection stays open
	});

	it('answers SERVICE_UNAVAILABLE when the relation store cannot answer on an event', async () => {
		const s = await serving();
		await s.access.grant({ type: 'ward', id: 'w1' }, 'visitors', s.ada.user);
		const { client } = s.client({ headers: { cookie: s.cookie(s.ada.token) } });
		s.outage.relations = true;
		const streamed = await stream(
			client,
			'subscription { visits(ward: "w1") }',
		);
		expect(codesOf(streamed)).toEqual(['SERVICE_UNAVAILABLE']);
	});
});
