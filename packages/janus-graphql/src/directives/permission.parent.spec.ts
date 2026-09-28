import { describe, expect, it } from 'bun:test';
import { ask, codes } from '../../test/harness';
import { wards, wired } from './permission.fixtures';

const typeDefs = /* GraphQL */ `
	type Query {
		records: [Record]
		visit: Visit
		search: [Found]
	}

	"Every field of the type: parent.id, the record itself."
	type Record @permission(name: "view", type: "record") {
		id: ID!
		title: String
	}

	"One field, on the object another field of the parent names."
	type Visit {
		wardId: ID!
		notes: String @permission(name: "enter", type: "ward", id: "parent.wardId")
	}

	"An interface: every field of every type implementing it."
	interface Found @permission(name: "enter", type: "ward") {
		id: ID!
		label: String
	}
	type Ward implements Found {
		id: ID!
		label: String
	}
`;

/** A record as an ORM hands it over: its fields behind getters and private state. */
class RecordRow {
	readonly #doctorId: string;
	constructor(
		readonly id: string,
		doctorId: string,
		readonly title: string,
	) {
		this.#doctorId = doctorId;
	}
	get doctorId(): string {
		return this.#doctorId;
	}
}

async function setUp() {
	const holder: { doctorId: string } = { doctorId: '' };
	const resolvers = {
		// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
		Query: {
			records: () => [
				Object.freeze(new RecordRow('r1', holder.doctorId, 'Blood test')),
			],
			visit: () => ({ wardId: 'w1', notes: 'Quiet night' }),
			search: () => [{ id: 'w2', label: 'Ward 2' }],
		},
		// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
		Found: { __resolveType: () => 'Ward' },
	};
	const w = await wired(typeDefs, resolvers);
	holder.doctorId = w.grace.user.id;
	await wards(w);
	return w;
}

describe('@permission reading the parent', () => {
	it('checks the parent itself, whose fromField fields are read through its getters', async () => {
		const { yoga, grace } = await setUp();
		// Grace holds no tuple on r1: she is its doctor, read from doctorId.
		const { body } = await ask(yoga, '{ records { id title } }', grace.token);
		expect(body).toEqual({
			data: { records: [{ id: 'r1', title: 'Blood test' }] },
		});
	});

	it('guards every field of the type, and not the field that reaches it', async () => {
		const { yoga, ada } = await setUp();
		const { status, body } = await ask(
			yoga,
			'{ records { title } }',
			ada.token,
		);
		expect(status).toBe(404);
		expect(body.errors?.[0]?.path).toEqual(['records', 0, 'title']);
		expect(body.data).toEqual({ records: [{ title: null }] });
	});

	it('checks the object another field of the parent names', async () => {
		const { yoga, ada, grace } = await setUp();
		const visitor = await ask(yoga, '{ visit { notes } }', ada.token);
		expect(visitor.body).toEqual({ data: { visit: { notes: 'Quiet night' } } });
		const nurse = await ask(yoga, '{ visit { notes } }', grace.token);
		expect(nurse.body).toEqual({ data: { visit: { notes: 'Quiet night' } } });
	});

	it('guards the fields of every type implementing an interface', async () => {
		const { yoga, ada, grace } = await setUp();
		const visitor = await ask(yoga, '{ search { label } }', ada.token);
		expect(codes(visitor.body)).toEqual(['NOT_FOUND']);

		const nurse = await ask(yoga, '{ search { label } }', grace.token);
		expect(nurse.body).toEqual({ data: { search: [{ label: 'Ward 2' }] } });
	});
});

describe('@permission reading an integer id from the parent', () => {
	it('checks it as graphql-js serialises it, a string', async () => {
		const w = await wired(
			'type Query { wards: [Ward] } type Ward @permission(name: "enter", type: "ward") { id: ID! label: String }',
			// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
			{ Query: { wards: () => [{ id: 1, label: 'one' }] } },
		);
		await w.access.grant({ type: 'ward', id: '1' }, 'visitors', w.ada.user);
		const { body } = await ask(w.yoga, '{ wards { id label } }', w.ada.token);
		expect(body).toEqual({ data: { wards: [{ id: '1', label: 'one' }] } });
	});
});

describe('@permission reading the parent, refused', () => {
	it('answers a user holding nothing on the parent NOT_FOUND', async () => {
		const w = await wired(typeDefs, {
			// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
			Query: { visit: () => ({ wardId: 'w9', notes: 'Quiet night' }) },
		});
		const { status, body } = await ask(
			w.yoga,
			'{ visit { notes } }',
			w.ada.token,
		);
		expect(status).toBe(404);
		expect(body.data).toEqual({ visit: { notes: null } });
	});
});
