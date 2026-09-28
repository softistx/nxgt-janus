import { describe, expect, it } from 'bun:test';
import { buildSchema } from 'graphql';
import { ask, codes, server, setup, users } from '../../test/harness';
import { janusTypeDefs } from '../sdl';
import { applyJanusDirectives } from './apply';

const typeDefs = /* GraphQL */ `
	type Query {
		profile: Profile
		ward: Ward
		search: [Found!]!
		audit: Audit
	}

	"Every field of a type: a signed-in user."
	type Profile @authenticated {
		name: String
	}

	"A type for staff, one field of which is narrower still."
	type Ward @authenticated(type: ["staff"]) {
		name: String
		chart: String @authenticated(type: ["staff", "patient"])
	}

	"A whole interface: every field of every type implementing it."
	interface Found @authenticated {
		label: String
	}
	type Doctor implements Found {
		label: String
	}

	"One field of an interface: that field of every type implementing it."
	interface Audited {
		trail: String @authenticated(type: ["staff"])
		title: String
	}
	type Audit implements Audited {
		trail: String
		title: String
	}
`;

const resolvers = {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Query: {
		profile: () => ({ name: 'Ada' }),
		ward: () => ({ name: 'Ward 7', chart: 'chart' }),
		search: () => [{ label: 'Dr Grace' }],
		audit: () => ({ trail: 'trail', title: 'title' }),
	},
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	Found: {
		__resolveType: () => 'Doctor',
	},
};

async function wired() {
	const context = setup();
	const signedUp = await users(context);
	return { yoga: server(context, typeDefs, resolvers), ...signedUp };
}

describe('@authenticated on a type', () => {
	it('guards every field of the type, and not the field that reaches it', async () => {
		const { yoga, ada } = await wired();
		const anonymous = await ask(yoga, '{ profile { name } }');
		expect(anonymous.status).toBe(401);
		expect(anonymous.body.errors?.[0]?.path).toEqual(['profile', 'name']);

		const signedIn = await ask(yoga, '{ profile { name } }', ada.token);
		expect(signedIn.body).toEqual({ data: { profile: { name: 'Ada' } } });
	});

	it("requires the type's restriction and the field's together", async () => {
		const { yoga, ada, grace } = await wired();
		const patient = await ask(yoga, '{ ward { chart } }', ada.token);
		expect(codes(patient.body)).toEqual(['FORBIDDEN']);

		const staff = await ask(yoga, '{ ward { name chart } }', grace.token);
		expect(staff.body).toEqual({
			data: { ward: { name: 'Ward 7', chart: 'chart' } },
		});
	});
});

describe('@authenticated on an interface', () => {
	it('guards every field of every type implementing it', async () => {
		const { yoga, ada } = await wired();
		const anonymous = await ask(yoga, '{ search { label } }');
		expect(codes(anonymous.body)).toEqual(['UNAUTHENTICATED']);

		const signedIn = await ask(yoga, '{ search { label } }', ada.token);
		expect(signedIn.body).toEqual({
			data: { search: [{ label: 'Dr Grace' }] },
		});
	});

	it('guards the field of the same name, and leaves the others', async () => {
		const { yoga, ada, grace } = await wired();
		const patient = await ask(yoga, '{ audit { title trail } }', ada.token);
		expect(patient.body.data).toEqual({
			audit: { title: 'title', trail: null },
		});
		expect(codes(patient.body)).toEqual(['FORBIDDEN']);

		const staff = await ask(yoga, '{ audit { trail } }', grace.token);
		expect(staff.body).toEqual({ data: { audit: { trail: 'trail' } } });
	});
});

describe('@authenticated on a type, refused when the schema is built', () => {
	const auth = { types: ['patient', 'staff'] };

	it('names the type and the field that reads it', () => {
		const schema = buildSchema(
			`${janusTypeDefs}type Query { ward: Ward } type Ward @authenticated(type: ["nurse"]) { name: String }`,
		);
		expect(() => applyJanusDirectives(schema, { auth })).toThrow(
			new TypeError(
				"applyJanusDirectives(): @authenticated on Ward (read by Ward.name) names the user type 'nurse', which is not one of 'patient', 'staff'",
			),
		);
	});

	it('refuses restrictions no user type meets together', () => {
		const schema = buildSchema(
			`${janusTypeDefs}type Query { ward: Ward } type Ward @authenticated(type: ["staff"]) { name: String @authenticated(type: ["patient"]) }`,
		);
		expect(() => applyJanusDirectives(schema, { auth })).toThrow(
			/on Ward\.name and on its type or interfaces admit no user type in common/,
		);
	});
});
