/**
 * What the reference form of the model — `related`, `permits`, `rules` —
 * refuses at COMPILE time, and what it must keep typing exactly as the
 * string form does. Checked by `tsc --noEmit`, never run.
 *
 * **Eleven plausible mistakes, eleven refused**, each verified to fail for the
 * reason its comment names. Add a case whenever the form gains something it
 * should refuse; never delete one to make a change pass.
 */

import type {
	Can,
	ConfigOf,
	CtxOf,
	HolderOf,
} from '../../src/permissions/model';
import { defineModel, fromField, when } from '../../src/permissions/model';

const subjects = ['patient', 'staff'] as const;

// Must keep compiling: every kind of reference, typed from the declared names.
export const clinic = defineModel({
	subjects,
	types: {
		team: {
			related: { members: ['staff', 'team#members'], leads: ['staff'] },
			permits: ['manage', 'view'],
		},
		record: {
			related: {
				patients: fromField('patientId', 'patient'),
				doctors: fromField('doctorId', 'staff', {
					lookup: async () => [],
				}),
				teams: ['team'],
			},
			permits: ['view', 'edit'],
		},
		// The string form beside it: one model, two spellings.
		note: {
			relations: { record: ['record'] },
			permissions: { view: ['record->view'] },
		},
	},
	rules: {
		team: {
			manage: ({ related }) => [related.leads],
			view: ({ related, permits }) => [
				related.members,
				permits.manage,
				related.members,
			],
		},
		record: {
			view: ({ related }) => [
				related.patients,
				related.doctors,
				related.teams.permits.view,
				related.teams.related.leads,
			],
			edit: ({ related }) => [
				when(related.doctors, (ctx: { onShift: boolean }) => ctx.onShift),
			],
		},
	},
});

type Clinic = ConfigOf<typeof clinic>;

// The normalized model is the string form: what every reading type sees.
export const teamView: Clinic['types']['team']['permissions']['view'] = [
	'members',
	'manage',
	'members',
];
export const recordView: Clinic['types']['record']['permissions']['view'] = [
	'patients',
	'doctors',
	'teams->view',
	'teams->leads',
];
export const editCtx: CtxOf<Clinic, 'record', 'edit'> = { onShift: true };
export const noteView: Clinic['types']['note']['permissions']['view'] = [
	'record->view',
];
export const holder: HolderOf<Clinic, 'team', 'members'> = {
	type: 'team',
	id: 't1',
	relation: 'members',
};

defineModel({
	subjects,
	types: {
		folder: { related: { owners: ['staff'] }, permits: ['view', 'share'] },
	},
	rules: {
		folder: {
			// @ts-expect-error 1. a relation folder does not have
			view: ({ related }) => [related.viewers],
			// @ts-expect-error 2. a boolean is not a list of references: a rule declares, it does not check
			share: ({ related }) => related.owners.kind === 'relation',
		},
	},
});

defineModel({
	subjects,
	types: {
		folder: { related: { owners: ['staff'] }, permits: ['view', 'edit'] },
	},
	rules: {
		folder: {
			view: ({ related }) => [related.owners],
			// @ts-expect-error 3. a permission's own name: a loop nothing ends
			edit: ({ permits }) => [permits.edit],
		},
	},
});

defineModel({
	subjects,
	types: {
		folder: { related: { owners: ['staff'] }, permits: ['view'] },
		document: { related: { parents: ['folder'] }, permits: ['view'] },
	},
	rules: {
		folder: { view: ({ related }) => [related.owners] },
		// @ts-expect-error 4. an arrow to a permission the folder does not have
		document: { view: ({ related }) => [related.parents.permits.publish] },
	},
});

defineModel({
	subjects,
	types: {
		folder: { related: { owners: ['staff'] }, permits: ['view'] },
		document: { related: { parents: ['folder'] }, permits: ['view'] },
	},
	rules: {
		folder: { view: ({ related }) => [related.owners] },
		// @ts-expect-error 5. an arrow to a relation the folder does not have
		document: { view: ({ related }) => [related.parents.related.editors] },
	},
});

defineModel({
	subjects,
	types: {
		document: { related: { owners: ['staff'] }, permits: ['view'] },
	},
	rules: {
		// @ts-expect-error 6. no arrow through a relation held by a user type: a user has no permits
		document: { view: ({ related }) => [related.owners.permits.view] },
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { members: ['staff'] }, permits: ['view'] },
		document: {
			related: { teams: ['team', 'team#members'] },
			permits: ['view'],
		},
	},
	rules: {
		team: { view: ({ related }) => [related.members] },
		// @ts-expect-error 7. no arrow through a relation that can hold a subject set: an arrow follows object types only
		document: { view: ({ related }) => [related.teams.permits.view] },
	},
});

defineModel({
	subjects,
	types: {
		folder: { related: { owners: ['staff'] }, permits: ['view'] },
	},
	rules: {
		folder: {
			view: ({ related }) => [related.owners],
			// @ts-expect-error 8. a rule for a permit the type does not declare
			edit: ({ related }) => [related.owners],
		},
	},
});

defineModel({
	subjects,
	types: {
		// @ts-expect-error 9. a holder type that does not exist — the string form's check, on `related` too
		folder: { related: { owners: ['admin'] }, permits: ['view'] },
	},
});

defineModel({
	subjects,
	types: {
		folder: { related: { owners: ['staff'] }, permits: ['view'] },
	},
	rules: {
		folder: {
			// @ts-expect-error 10. a string where a reference is expected: the two spellings do not mix inside a rule
			view: () => ['owners'],
		},
	},
});

// A `when` on a string is a rule too: the two spellings mix inside a rule,
// and the string is checked as the string form checks it.
export const mixed = defineModel({
	subjects,
	types: {
		folder: { related: { owners: ['staff'] }, permits: ['view'] },
	},
	rules: {
		folder: {
			view: ({ related }) => [when('owners', () => true), related.owners],
		},
	},
});

// 11. `ctx` is required exactly when a condition is reachable, through the reference form too.
export const canEdit = (
	access: { can: Can<Clinic> },
	staff: { type: 'staff'; id: string },
) =>
	// @ts-expect-error 11. edit reaches a `when`: ctx is required
	access.can(staff, 'edit', {
		type: 'record',
		id: 'r1',
		patientId: 'p1',
		doctorId: staff.id,
	});
