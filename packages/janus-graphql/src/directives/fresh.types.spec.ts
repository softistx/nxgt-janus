import { describe, expect, it } from 'bun:test';
import { ask, codes } from '../../test/harness';
import { wired } from '../../test/wired';

const typeDefs = /* GraphQL */ `
	type Query {
		account: Account
		search: [Found!]!
	}

	"Every field of a type; one of them asks a more recent proof."
	type Account @fresh(maxAge: 600) {
		email: String
		card: String @fresh(maxAge: 60)
	}

	"A whole interface: every field of every type implementing it."
	interface Found @fresh(maxAge: 600) {
		label: String
	}
	type Payment implements Found {
		label: String
	}
`;

const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Query: {
		account: () => ({ email: 'ada@example.test', card: '4242' }),
		search: () => [{ label: 'rent' }],
	},
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Found: { __resolveType: () => 'Payment' },
};

describe('@fresh on a type', () => {
	it('guards every field of the type, and not the field that reaches it', async () => {
		const { yoga, ada, clock } = await wired(typeDefs, resolvers);
		clock.advance(600_000);
		const { status, body } = await ask(
			yoga,
			'{ account { email } }',
			ada.token,
		);
		expect(status).toBe(403);
		expect(codes(body)).toEqual(['STEP_UP_REQUIRED']);
		expect(body.errors?.[0]?.path).toEqual(['account', 'email']);
	});

	it("holds the smallest maxAge: the field's, where it is under the type's", async () => {
		const { yoga, ada, clock } = await wired(typeDefs, resolvers);
		clock.advance(60_000);
		const { body } = await ask(yoga, '{ account { email card } }', ada.token);
		expect(body.data).toEqual({
			account: { email: 'ada@example.test', card: null },
		});
		expect(codes(body)).toEqual(['STEP_UP_REQUIRED']);
		expect(body.errors?.[0]?.path).toEqual(['account', 'card']);
	});
});

describe('@fresh on an interface', () => {
	it('guards every field of every type implementing it', async () => {
		const { yoga, ada, clock } = await wired(typeDefs, resolvers);
		const fresh = await ask(yoga, '{ search { label } }', ada.token);
		expect(fresh.body).toEqual({ data: { search: [{ label: 'rent' }] } });

		clock.advance(600_000);
		const stale = await ask(yoga, '{ search { label } }', ada.token);
		expect(codes(stale.body)).toEqual(['STEP_UP_REQUIRED']);
	});
});
