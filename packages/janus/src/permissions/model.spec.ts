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
				related: { members: ['staff', 'team#members'], leads: ['staff'] },
				permits: { manage: ['leads'], view: ['members', 'manage'] },
			},
			record: {
				related: {
					doctors: fromField('doctorId', 'staff'),
					teams: ['team'],
				},
				permits: {
					view: ['doctors', 'teams->view', 'edit'],
					edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
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

		expect(team?.relations.get('members')).toEqual({
			kind: 'stored',
			holders: [
				{ kind: 'type', type: 'staff' },
				{ kind: 'set', type: 'team', relation: 'members' },
			],
		});
		expect(record?.relations.get('doctors')).toEqual({
			kind: 'fromField',
			field: 'doctorId',
			subject: 'staff',
		});
		const [doctor, arrow, edit] = record?.permissions.get('view') ?? [];
		expect(doctor).toEqual({ kind: 'name', name: 'doctors' });
		expect(arrow).toEqual({ kind: 'arrow', relation: 'teams', target: 'view' });
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
						related: { parents: ['folder'], owners: ['staff'] },
						permits: { view: ['owners', 'parents->view'] },
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
	const team = { related: { leads: ['staff'] } };
	const cases: [string, () => unknown, string][] = [
		[
			'no subjects array',
			define({ types: { team } }),
			'an array of subject type names — auth.types from janus(), or your own',
		],
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
				types: { team: { related: { 'a#b': ['staff'] } } },
			}),
			'"a#b" must be a camelCase name',
		],
		[
			'an empty relation',
			define({ subjects, types: { team: { related: { leads: [] } } } }),
			'non-empty array',
		],
		[
			'a key an object type does not have',
			define({ subjects, types: { team: { ...team, roles: {} } } }),
			'types.team.roles is not a key of an object type: related or permits',
		],
		[
			'relations, the key before 0.2',
			define({
				subjects,
				types: { team: { relations: { leads: ['staff'] } } },
			}),
			'types.team.relations is now related: rename the key',
		],
		[
			'permissions, the key before 0.2',
			define({
				subjects,
				types: { team: { ...team, permissions: { view: ['leads'] } } },
			}),
			'types.team.permissions is now permits: rename the key',
		],
		[
			'a subject set naming an unknown relation',
			define({
				subjects,
				types: { team: { related: { members: ['team#membre'] } } },
			}),
			'"team#membre" is not a subject set',
		],
		[
			'a fromField reading a nested path',
			define({
				subjects,
				types: {
					record: {
						related: { doctors: fromField('care.doctorId', 'staff') },
					},
				},
			}),
			'fromField must name a top-level field',
		],
		[
			'a fromField whose lookup is not a function',
			define({
				subjects,
				types: {
					record: {
						related: {
							doctors: {
								kind: 'fromField',
								field: 'doctorId',
								subject: 'staff',
								lookup: 'ids',
							},
						},
					},
				},
			}),
			"fromField's lookup must be a function",
		],
		[
			'a relation and a permission with one name',
			define({
				subjects,
				types: { team: { ...team, permits: { leads: ['leads'] } } },
			}),
			'"leads" names a relation and a permission',
		],
		[
			'an arrow through a subject set',
			define({
				subjects,
				types: {
					team: {
						related: { members: ['staff'], subteams: ['team#members'] },
						permits: { view: ['subteams->view', 'members'] },
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
						permits: { manage: [{ kind: 'when', rule: 'leads', test: 1 }] },
					},
				},
			}),
			'when() takes a function',
		],
		[
			'a subject set on a relation read from a field',
			define({
				subjects,
				types: {
					team: { related: { leads: fromField('leadId', 'staff') } },
					record: { related: { viewers: ['team#leads'] } },
				},
			}),
			'"team#leads" reads team.leadId, and a subject set reaches teams nobody passed to can()',
		],
		[
			'an arrow to a permission read from the target’s own fields',
			define({
				subjects,
				types: {
					team: {
						related: { leads: fromField('leadId', 'staff') },
						permits: { manage: ['leads'] },
					},
					record: {
						related: { teams: ['team'] },
						permits: { view: ['teams->manage'] },
					},
				},
			}),
			'"teams->manage" reaches team.manage, which reads team.leadId',
		],
		[
			'a loop no relation ends',
			define({
				subjects,
				types: {
					team: {
						...team,
						permits: { view: ['edit'], edit: ['manage'], manage: ['view'] },
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
