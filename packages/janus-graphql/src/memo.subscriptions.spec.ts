import { describe, expect, it } from 'bun:test';
import { wards, wired } from '../test/wired';

const typeDefs = /* GraphQL */ `
	type Query {
		open: String
	}
	type Subscription {
		ticks(ward: ID!): Int
			@permission(name: "enter", type: "ward", id: "args.ward")
	}
`;

/** A subscription over server-sent events: one request, however many events. */
async function subscribe(
	yoga: Awaited<ReturnType<typeof wired>>['yoga'],
	token: string,
) {
	const response = await yoga.fetch('http://yoga.test/graphql', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'text/event-stream',
			authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ query: 'subscription { ticks(ward: "w1") }' }),
	});
	return response.text();
}

describe('the memo, in a subscription', () => {
	it('asks again on every event, so a revoke stops the stream', async () => {
		const box: { revoke?: () => Promise<void> } = {};
		async function* ticks() {
			yield { ticks: 1 };
			await box.revoke?.();
			yield { ticks: 2 };
		}
		const w = await wired(typeDefs, {
			// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
			Subscription: { ticks: { subscribe: ticks } },
		});
		await wards(w);
		box.revoke = () =>
			w.access.revoke({ type: 'ward', id: 'w1' }, 'visitors', w.ada.user);

		const text = await subscribe(w.yoga, w.ada.token);
		expect(text).toContain('"ticks":1');
		expect(text).not.toContain('"ticks":2');
		expect(text).toContain('"code":"NOT_FOUND"');
	});
});
