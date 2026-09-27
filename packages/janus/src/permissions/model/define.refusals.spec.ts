import { describe, expect, it } from 'bun:test';
import { define, subjects } from './define.fixtures';
import { fromField } from './from-field';

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
			'several faults: the subjects are refused before the types',
			define({ subjects: 'staff', types: {} }),
			'subjects must be an array',
		],
		[
			'several faults: a type is read whole, in order, before the next one',
			define({
				subjects,
				types: {
					team: { roles: {} },
					record: { related: { 'bad-name': ['staff'] } },
				},
			}),
			'types.team.roles is not a key of an object type',
		],
		[
			'several faults: a name is checked before it can clash',
			define({
				subjects,
				types: {
					team: {
						related: { leads: ['staff'] },
						permits: { leads: ['leads'], 'x-y': ['leads'] },
					},
				},
			}),
			'"x-y" must be a camelCase name',
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
