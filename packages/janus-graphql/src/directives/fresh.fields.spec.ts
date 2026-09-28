import { describe, expect, it } from 'bun:test';
import { ask, codes } from '../../test/harness';
import { wards, wired } from '../../test/wired';

const typeDefs = /* GraphQL */ `
	type Query {
		open: String
		email: String @fresh(maxAge: 600)
		roster: String @authenticated(type: ["staff"]) @fresh(maxAge: 600)
		ward(id: ID!): String
			@fresh(maxAge: 600)
			@permission(name: "enter", type: "ward")
	}
`;

const TEN_MINUTES = 600_000;

async function setUp() {
	const ran: string[] = [];
	const w = await wired(typeDefs, {
		// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
		Query: {
			open: () => 'open',
			email: () => {
				ran.push('email');
				return 'ada@example.test';
			},
			roster: () => 'roster',
			ward: (_: unknown, { id }: { id: string }) => id,
		},
	});
	await wards(w);
	return { ...w, ran };
}

describe('@fresh on a field', () => {
	it('runs the resolver for a session signed in less than maxAge ago', async () => {
		const { yoga, ada, clock, ran } = await setUp();
		clock.advance(TEN_MINUTES - 1);
		const { status, body } = await ask(yoga, '{ email }', ada.token);
		expect(status).toBe(200);
		expect(body).toEqual({ data: { email: 'ada@example.test' } });
		expect(ran).toEqual(['email']);
	});

	it('answers a session maxAge old STEP_UP_REQUIRED, 403, and never runs the resolver', async () => {
		const { yoga, ada, clock, ran } = await setUp();
		clock.advance(TEN_MINUTES);
		const { status, body } = await ask(yoga, '{ open email }', ada.token);
		expect(status).toBe(403);
		expect(codes(body)).toEqual(['STEP_UP_REQUIRED']);
		expect(body.errors?.[0]?.path).toEqual(['email']);
		expect(body.errors?.[0]?.message).toBe('Forbidden');
		expect(body.data).toEqual({ open: 'open', email: null });
		expect(ran).toEqual([]);
	});

	it('answers an anonymous request UNAUTHENTICATED, 401', async () => {
		const { yoga, ran } = await setUp();
		const { status, body } = await ask(yoga, '{ email }');
		expect(status).toBe(401);
		expect(codes(body)).toEqual(['UNAUTHENTICATED']);
		expect(ran).toEqual([]);
	});
});

describe('@fresh with the other directives', () => {
	it("checks @authenticated's user type first: FORBIDDEN, not STEP_UP_REQUIRED", async () => {
		const { yoga, ada, grace, clock } = await setUp();
		clock.advance(TEN_MINUTES);
		const patient = await ask(yoga, '{ roster }', ada.token);
		expect(codes(patient.body)).toEqual(['FORBIDDEN']);
		const staff = await ask(yoga, '{ roster }', grace.token);
		expect(codes(staff.body)).toEqual(['STEP_UP_REQUIRED']);
	});

	it('refuses an older session before any @permission is asked', async () => {
		const { yoga, ada, clock, asked } = await setUp();
		clock.advance(TEN_MINUTES);
		const { status, body } = await ask(yoga, '{ ward(id: "w1") }', ada.token);
		expect(status).toBe(403);
		expect(codes(body)).toEqual(['STEP_UP_REQUIRED']);
		expect(asked.can).toBe(0);
	});

	it('asks @permission once the session is fresh, and answers its denial', async () => {
		const { yoga, ada, asked } = await setUp();
		const allowed = await ask(yoga, '{ ward(id: "w1") }', ada.token);
		expect(allowed.body).toEqual({ data: { ward: 'w1' } });
		const denied = await ask(yoga, '{ ward(id: "w2") }', ada.token);
		expect(codes(denied.body)).toEqual(['NOT_FOUND']);
		expect(asked.can).toBe(2);
	});
});
