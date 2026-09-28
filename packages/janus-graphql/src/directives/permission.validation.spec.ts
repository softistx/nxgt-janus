import { describe, expect, it } from 'bun:test';
import { buildSchema } from 'graphql';
import { setup } from '../../test/harness';
import { janusTypeDefs } from '../sdl';
import { applyJanusDirectives, type JanusDirectivesOptions } from './apply';

const { auth, access } = setup();
const loaders = { record: () => null };
const conditions = { record: () => ({ locked: false }) };

function build(
	sdl: string,
	options: Omit<JanusDirectivesOptions, 'auth' | 'type'> = {
		access,
		loaders,
		conditions,
	},
) {
	return () =>
		applyJanusDirectives(buildSchema(janusTypeDefs + sdl), {
			auth,
			...options,
		});
}

const refusal = (message: string) =>
	new TypeError(`applyJanusDirectives(): ${message}`);

describe('@permission refused when the schema is built', () => {
	it('names an object type the model does not declare', () => {
		expect(
			build(
				'type Query { invoice(id: ID!): String @permission(name: "view", type: "invoice") }',
			),
		).toThrow(
			refusal(
				"@permission on Query.invoice names the object type 'invoice', which is not one of 'record', 'ward'",
			),
		);
	});

	it('names a permission the type does not declare', () => {
		expect(
			build(
				'type Query { ward(id: ID!): String @permission(name: "delete", type: "ward") }',
			),
		).toThrow(
			refusal(
				"@permission on Query.ward asks 'delete', which ward does not declare — it declares 'nurses', 'visitors', 'enter', 'manage'",
			),
		);
	});

	for (const id of [
		'id',
		'args',
		'args.',
		'parent..id',
		'args.1st',
		'source.id',
		'args.id-x',
	]) {
		it(`names a malformed id: '${id}'`, () => {
			expect(
				build(
					`type Query { ward(id: ID!): String @permission(name: "enter", type: "ward", id: "${id}") }`,
				),
			).toThrow(
				refusal(
					`@permission on Query.ward reads its id from '${id}', which is not args.<name> or parent.<name>`,
				),
			);
		});
	}

	it('names an argument the field does not take', () => {
		expect(
			build(
				'type Query { ward(key: ID!): String @permission(name: "enter", type: "ward", id: "args.wardId") }',
			),
		).toThrow(
			refusal(
				'@permission on Query.ward reads args.wardId, and Query.ward takes no argument wardId',
			),
		);
	});

	it("says how to name the id when a field's default, args.id, is not an argument", () => {
		expect(
			build(
				'type Query { ward: Ward } type Ward { id: ID! name: String @permission(name: "enter", type: "ward") }',
			),
		).toThrow(
			refusal(
				'@permission on Ward.name reads args.id, and Ward.name takes no argument id — name the id with id: "parent.<field>" or id: "args.<name>"',
			),
		);
	});

	it('names a type-level args path for each field that does not take it', () => {
		expect(
			build(
				'type Query { ward: Ward } type Ward @permission(name: "enter", type: "ward", id: "args.id") { name: String }',
			),
		).toThrow(
			refusal(
				'@permission on Ward (read by Ward.name) reads args.id, and Ward.name takes no argument id',
			),
		);
	});

	it('names a fromField type reached by args with no loader', () => {
		expect(
			build(
				'type Query { record(id: ID!): String @permission(name: "view", type: "record") }',
				{ access },
			),
		).toThrow(
			refusal(
				"@permission on Query.record reads the record's id from args.id, and record reads 'doctorId' of the object itself (fromField) — pass useJanus({ loaders: { record: (id, ctx) => … } })",
			),
		);
	});

	it('names a fromField type reached by another field of the parent with no loader', () => {
		expect(
			build(
				'type Query { visit: Visit } type Visit { recordId: ID! notes: String @permission(name: "view", type: "record", id: "parent.recordId") }',
				{ access },
			),
		).toThrow(/reads the record's id from parent\.recordId/);
	});

	it('needs no loader for a fromField type whose parent is the object', () => {
		expect(
			build(
				'type Query { record: Record } type Record @permission(name: "view", type: "record") { id: ID! }',
				{ access },
			),
		).not.toThrow();
	});

	it('names a condition reached with no conditions entry', () => {
		expect(
			build(
				'type Query { record(id: ID!): String @permission(name: "edit", type: "record") }',
				{ access, loaders },
			),
		).toThrow(
			refusal(
				"@permission on Query.record asks 'edit' of record, which reaches a when() — pass useJanus({ conditions: { record: (object, ctx) => … } })",
			),
		);
	});

	it('names a loader that is not a function', () => {
		expect(
			build(
				'type Query { ward(id: ID!): String @permission(name: "enter", type: "ward") }',
				{ access, loaders: { ward: 'wards' as never } },
			),
		).toThrow(
			refusal(
				'@permission on Query.ward finds loaders.ward, which is not a function',
			),
		);
	});

	it('names the field with no access to read the model from', () => {
		expect(
			build(
				'type Query { ward(id: ID!): String @permission(name: "enter", type: "ward") }',
				{},
			),
		).toThrow(
			refusal(
				'@permission on Query.ward needs the permissions() instance — pass useJanus({ auth, access }), with access what permissions() answered',
			),
		);
	});

	it('names the interface a directive was written on', () => {
		expect(
			build(
				'type Query { found: Found } interface Found @permission(name: "open", type: "ward") { id: ID! } type Ward implements Found { id: ID! }',
			),
		).toThrow(/@permission on Found \(read by Ward\.id\) asks 'open'/);
	});
});
