import { describe, expect, it } from 'bun:test';
import {
	defineModel,
	fromField,
	type ModelConfig,
	resolvedOf,
	when,
} from './model';

const subjects = ['patient', 'staff'] as const;

const clinic = () =>
	defineModel({
		subjects,
		types: {
			team: {
				relations: { member: ['staff', 'team#member'], lead: ['staff'] },
				permissions: { manage: ['lead'], view: ['member', 'manage'] },
			},
			record: {
				relations: {
					doctor: fromField('doctorId', 'staff'),
					team: ['team'],
				},
				permissions: {
					view: ['doctor', 'team->view', 'edit'],
					edit: [when('doctor', (ctx: { onShift: boolean }) => ctx.onShift)],
				},
			},
		},
	});

/** Defines from JavaScript: the types would refuse most of these first. */
const define = (config: Record<string, unknown>) => () =>
	defineModel(config as unknown as ModelConfig as never);

describe('defineModel', () => {
	it('answers the subject and object types, and the definition as written', () => {
		const model = clinic();

		expect(model.subjects).toEqual(['patient', 'staff']);
		expect(model.types).toEqual(['team', 'record']);
		expect(Object.isFrozen(model)).toBe(true);
	});

	it('parses every rule once: names, arrows, subject sets, fields and conditions', () => {
		const record = resolvedOf(clinic()).types.get('record');
		const team = resolvedOf(clinic()).types.get('team');

		expect(team?.relations.get('member')).toEqual({
			kind: 'stored',
			holders: [
				{ kind: 'type', type: 'staff' },
				{ kind: 'set', type: 'team', relation: 'member' },
			],
		});
		expect(record?.relations.get('doctor')).toEqual({
			kind: 'fromField',
			field: 'doctorId',
			subject: 'staff',
		});
		const [doctor, arrow, edit] = record?.permissions.get('view') ?? [];
		expect(doctor).toEqual({ kind: 'name', name: 'doctor' });
		expect(arrow).toEqual({ kind: 'arrow', relation: 'team', target: 'view' });
		expect(edit).toEqual({ kind: 'name', name: 'edit' });
		const [conditional] = record?.permissions.get('edit') ?? [];
		expect(conditional?.kind).toBe('name');
		expect(typeof conditional?.test).toBe('function');
	});

	it('accepts a loop that crosses a relation: data ends it, not the model', () => {
		expect(
			define({
				subjects,
				types: {
					folder: {
						relations: { parent: ['folder'], owner: ['staff'] },
						permissions: { view: ['owner', 'parent->view'] },
					},
				},
			}),
		).not.toThrow();
	});

	it('refuses a model it did not make', () => {
		expect(() => resolvedOf({})).toThrow('was not made by defineModel()');
	});
});

describe('refuses, with a TypeError, what only running it can see', () => {
	const team = { relations: { lead: ['staff'] } };
	const cases: [string, () => unknown, string][] = [
		['no subjects array', define({ types: { team } }), 'pass auth.types'],
		['no object type', define({ subjects, types: {} }), 'no object type'],
		[
			'an object type that is not camelCase',
			define({ subjects, types: { 'care-team': team } }),
			'"care-team" must be a camelCase name',
		],
		[
			'an object type named like a user type',
			define({ subjects, types: { staff: team } }),
			'"staff" names a user type and an object type',
		],
		[
			'a relation name with the notation’s separator',
			define({
				subjects,
				types: { team: { relations: { 'a#b': ['staff'] } } },
			}),
			'"a#b" must be a camelCase name',
		],
		[
			'an empty relation',
			define({ subjects, types: { team: { relations: { lead: [] } } } }),
			'non-empty array',
		],
		[
			'a key an object type does not have',
			define({ subjects, types: { team: { ...team, roles: {} } } }),
			'types.team.roles is not a key',
		],
		[
			'a subject set naming an unknown relation',
			define({
				subjects,
				types: { team: { relations: { member: ['team#membre'] } } },
			}),
			'"team#membre" is not a subject set',
		],
		[
			'a fromField reading a nested path',
			define({
				subjects,
				types: {
					record: {
						relations: { doctor: fromField('care.doctorId', 'staff') },
					},
				},
			}),
			'fromField must name a top-level field',
		],
		[
			'a relation and a permission with one name',
			define({
				subjects,
				types: { team: { ...team, permissions: { lead: ['lead'] } } },
			}),
			'"lead" names a relation and a permission',
		],
		[
			'an arrow through a subject set',
			define({
				subjects,
				types: {
					team: {
						relations: { member: ['staff'], sub: ['team#member'] },
						permissions: { view: ['sub->view', 'member'] },
					},
				},
			}),
			'an arrow follows object types only',
		],
		[
			'a condition that is not a function',
			define({
				subjects,
				types: {
					team: {
						...team,
						permissions: { manage: [{ kind: 'when', rule: 'lead', test: 1 }] },
					},
				},
			}),
			'when() takes a function',
		],
		[
			'a loop no relation ends',
			define({
				subjects,
				types: {
					team: {
						...team,
						permissions: { view: ['edit'], edit: ['manage'], manage: ['view'] },
					},
				},
			}),
			'view → edit → manage → view is a loop no relation ends',
		],
	];

	for (const [name, call, message] of cases) {
		it(name, () => {
			expect(call).toThrow(TypeError);
			expect(call).toThrow(message);
		});
	}
});
