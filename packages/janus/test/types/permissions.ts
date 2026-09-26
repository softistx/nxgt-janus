/**
 * What the permission model refuses at COMPILE time, seen from the
 * application writing one and asking it questions.
 *
 * Checked by `tsc --noEmit`, never run — see `refusals.ts` for why a
 * `@ts-expect-error` is the unit of measurement. Each would otherwise surface
 * as a permission that silently never grants: a typo in a relation, an arrow
 * to a permission its target lacks, an object passed without the field a
 * `fromField` reads, a condition asked without its context.
 *
 * **Forty-eight plausible mistakes, forty-eight refused**, each verified to fail for
 * the reason its comment names — a refusal that fails for another reason
 * proves nothing. Add a case whenever the model gains something it should
 * refuse; never delete one to make a change pass.
 */

import { permissions } from '../../src/permissions/engine';
import {
	type Can,
	type ConfigOf,
	defineModel,
	fromField,
	when,
} from '../../src/permissions/model';
import { createMemoryRelations } from '../../src/permissions/port/memory';
import { setOf } from '../../src/subjects/subject';

/** What `auth.types` answers for a clinic with two user types. */
const subjects = ['patient', 'staff'] as const;

const clinic = defineModel({
	subjects,
	types: {
		team: {
			related: { members: ['staff', 'team#members'], leads: ['staff'] },
			permits: { manage: ['leads'], view: ['members', 'manage'] },
		},
		record: {
			related: {
				patients: fromField('patientId', 'patient'),
				doctors: fromField('doctorId', 'staff'),
				teams: ['team'],
				viewers: ['staff', 'team#members'],
			},
			permits: {
				view: ['patients', 'doctors', 'viewers', 'teams->view', 'edit'],
				edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
			},
		},
	},
});

declare const can: Can<ConfigOf<typeof clinic>>;
const staff = { type: 'staff', id: 'u1' } as const;
const record = {
	type: 'record',
	id: 'r1',
	patientId: 'p1',
	doctorId: null,
} as const;

// ─── The model ────────────────────────────────────────────────────────────

defineModel({
	subjects,
	types: {
		// @ts-expect-error 1. "staf" is not a subject type
		team: { related: { members: ['staf'] } },
	},
});

defineModel({
	subjects,
	types: {
		// @ts-expect-error 2. a subject set naming a relation team does not have
		team: { related: { members: ['team#membre'] } },
	},
});

defineModel({
	subjects,
	types: {
		record: {
			// @ts-expect-error 3. fromField naming "doctr", not a subject type
			related: { doctors: fromField('doctorId', 'doctr') },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { leads: ['staff'] },
			// @ts-expect-error 4. a rule naming no relation or permission
			permits: { manage: ['leed'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { leads: ['staff'] },
			// @ts-expect-error 5. a condition on a rule naming nothing
			permits: { manage: [when('leed', () => true)] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { leads: ['staff'] } },
		record: {
			related: { teams: ['team'] },
			// @ts-expect-error 6. an arrow to "view", which team does not declare
			permits: { view: ['teams->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		record: {
			related: { doctors: ['staff'] },
			// @ts-expect-error 7. an arrow through a relation holding users, who have no permissions
			permits: { view: ['doctors->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { leads: ['staff'] },
			// @ts-expect-error 8. "leads" names a relation and a permission
			permits: { leads: ['leads'] },
		},
	},
});

// ─── The questions ────────────────────────────────────────────────────────

// @ts-expect-error 9. a permission record does not declare
can(staff, 'edti', record, { ctx: { onShift: true } });

// @ts-expect-error 10. a permission of team, asked of a record
can(staff, 'manage', record);

can(
	staff,
	'view',
	// @ts-expect-error 11. a record without doctorId: the doctors relation could never hold
	{ type: 'record', id: 'r1', patientId: 'p1' },
	{ ctx: { onShift: true } },
);

// @ts-expect-error 12. edit is conditional, and no ctx is given
can(staff, 'edit', record);

// @ts-expect-error 13. view reaches edit's condition, so it needs the ctx too
can(staff, 'view', record);

// @ts-expect-error 14. the ctx has the wrong shape
can(staff, 'edit', record, { ctx: { onshift: true } });

// @ts-expect-error 15. "visitor" is neither a user type nor an object type
can({ type: 'visitor', id: 'v' }, 'view', { type: 'team', id: 't' });

// @ts-expect-error 16. "ward" is not an object type of the model
can(staff, 'view', { type: 'ward', id: 'w' });

// ─── Writing tuples ───────────────────────────────────────────────────────

const access = permissions({ model: clinic, store: createMemoryRelations() });

// @ts-expect-error 17. doctors is read from doctorId: there is no tuple to write
access.grant(record, 'doctors', staff);

// @ts-expect-error 18. team.leads is held by staff, not by patients
access.grant({ type: 'team', id: 't' }, 'leads', { type: 'patient', id: 'p' });

access.grant(record, 'viewers', {
	type: 'team',
	id: 't',
	// @ts-expect-error 19. record.viewers admits team#members, not team#leads
	relation: 'leads',
});

defineModel({
	subjects,
	types: {
		team: { related: { leads: fromField('leadId', 'staff') } },
		// @ts-expect-error 20. a subject set on a relation read from a field: no data to read it from
		record: { related: { viewers: ['team#leads'] } },
	},
});

// ─── Listing ──────────────────────────────────────────────────────────────

// @ts-expect-error 21. view reaches record.doctors, a fromField with no lookup: nothing finds those records
access.list(staff, 'view', 'record', { ctx: { onShift: true } });

// @ts-expect-error 22. a relation read from a field, listed directly, without its lookup
access.list(staff, 'patients', 'record');

const ward = permissions({
	model: defineModel({
		subjects,
		types: {
			bed: {
				related: {
					nurses: fromField('nurseId', 'staff', { lookup: async () => [] }),
				},
				permits: {
					use: [when('nurses', (ctx: { onShift: boolean }) => ctx.onShift)],
				},
			},
		},
	}),
	store: createMemoryRelations(),
});

// @ts-expect-error 23. use is conditional, and list() needs the ctx as can() does
ward.list(staff, 'use', 'bed');

// @ts-expect-error 24. "view" is no permission of bed
ward.list(staff, 'view', 'bed');

const { findObjects: _dropped, ...withoutFindObjects } =
	createMemoryRelations();

permissions({
	model: clinic,
	// @ts-expect-error 25. a store without findObjects cannot answer list()
	store: withoutFindObjects,
});

permissions({
	model: clinic,
	store: {
		...createMemoryRelations(),
		// @ts-expect-error 26. an absence is false, not null: has answers a boolean
		has: async () => null,
	},
});

// ─── What is allowed ──────────────────────────────────────────────────────

async function allowed() {
	return [
		// No condition on team.view: no ctx.
		await can(staff, 'view', { type: 'team', id: 't' }),
		// Anonymous is a question, answered false.
		await can(null, 'manage', { type: 'team', id: 't' }),
		await can(staff, 'edit', record, { ctx: { onShift: false } }),
		// A relation can be asked directly, and a fromField holding nobody is null.
		await can(staff, 'doctors', record),
		// An object can be a subject: a team, member of another team.
		await can({ type: 'team', id: 't' }, 'members', { type: 'team', id: 't2' }),
		// A user is a subject as it is; a subject set is granted by its relation.
		await access.grant({ type: 'team', id: 't' }, 'members', staff),
		await access.grant(record, 'viewers', {
			type: 'team',
			id: 't',
			relation: 'members',
		}),
		await access.can(staff, 'view', record, { ctx: { onShift: true } }),
		// Stored relations and arrows need nothing more to be listed.
		await access.list(staff, 'view', 'team', { limit: 10 }),
		await access.list(staff, 'teams', 'record', { after: null }),
		// A fromField with a lookup can be listed; its condition still needs ctx.
		await ward.list(staff, 'nurses', 'bed'),
		await ward.list(staff, 'use', 'bed', { ctx: { onShift: true }, limit: 5 }),
	];
}

// ─── Model shapes the constraint refuses ──────────────────────────────────
// defineModel names its choices in a constraint an editor completes
// (completions.spec.ts); each case below is one it must still refuse.

/** What `auth.types` answers: an array of the user types, not a tuple. */
declare const authTypes: readonly ('patient' | 'staff')[];

defineModel({
	subjects: authTypes,
	types: {
		// @ts-expect-error 27. "staf" is not a user type of auth.types
		team: { related: { m: ['staf'] } },
	},
});

defineModel({
	subjects: [],
	types: {
		// @ts-expect-error 28. with no subjects, "staff" is no subject type
		team: { related: { m: ['staff'] } },
	},
});

defineModel({
	subjects,
	types: {
		// @ts-expect-error 29. "ward" is no object type
		record: { related: { w: ['ward'] } },
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		// @ts-expect-error 30. a subject set names a relation, never a permission
		record: { related: { v: ['team#view'] } },
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		record: {
			related: { t: fromField('teamId', 'team') },
			// @ts-expect-error 31. an arrow through a fromField to what team lacks
			permits: { v: ['t->nope'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		group: { related: { m: ['staff'] } },
		record: {
			related: { o: ['team', 'group'] },
			// @ts-expect-error 32. an arrow to a permission group lacks, though team has it
			permits: { v: ['o->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		record: {
			related: { t: ['team', 'staff'] },
			// @ts-expect-error 33. an arrow through a relation that also holds users
			permits: { v: ['t->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		record: {
			related: { t: ['team'] },
			// @ts-expect-error 34. when() names an arrow to what team lacks
			permits: { v: [when('t->nope', () => true)] },
		},
	},
});

defineModel({
	subjects,
	types: {
		// @ts-expect-error 35. "leads" names a relation and a permission, even with no rule
		team: { related: { leads: ['staff'] }, permits: { leads: [] } },
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { m: ['staff'] },
			// @ts-expect-error 37. a permission naming itself adds nothing, and never ends
			permits: { view: ['m', 'view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { m: ['staff'] },
			// @ts-expect-error 38. "permission", singular: a key no object type has
			permission: { view: ['m'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		doc: {
			related: { teams: ['team', 'team#m'] },
			// @ts-expect-error 39. no arrow through a relation that can hold a subject set: an arrow follows object types only
			permits: { view: ['teams->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			// @ts-expect-error 40. relations, the key before 0.2: it is now related
			relations: { m: ['staff'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { m: ['staff'] },
			// @ts-expect-error 41. permissions, the key before 0.2: it is now permits
			permissions: { view: ['m'] },
		},
	},
});

const misspelled = {
	subjects,
	types: { team: { related: { m: ['staf'] } } },
} as const;
// @ts-expect-error 36. a model declared first is checked as one written inline
defineModel(misspelled);

// ─── A user type that is also an object type ──────────────────────────────

const people = permissions({
	model: defineModel({
		subjects,
		types: {
			staff: {
				related: { managers: ['staff', 'staff#managers'] },
				permits: { edit: ['managers'] },
			},
			note: { related: { owners: ['staff'], readers: ['staff#managers'] } },
		},
	}),
	store: createMemoryRelations(),
});
const note = { type: 'note', id: 'n' } as const;

people.grant(
	note,
	'readers',
	// @ts-expect-error 42. a user as written is that user: a set on a user type is made by setOf()
	{ type: 'staff', id: 'u1', relation: 'managers' },
);

// @ts-expect-error 43. staff has managers, not manager
people.grant(note, 'readers', setOf(staff, 'manager'));

// @ts-expect-error 44. note.owners admits a staff member, not the set of their managers
people.grant(note, 'owners', setOf(staff, 'managers'));

// @ts-expect-error 45. note.readers admits a set on staff, never on patient, which the model does not declare under types
people.grant(note, 'readers', setOf({ type: 'patient', id: 'p1' }, 'managers'));

// @ts-expect-error 46. can() is asked for a set on patient, which the model does not declare under types
people.can(setOf({ type: 'patient', id: 'p1' }, 'managers'), 'edit', staff);

// @ts-expect-error 47. list() takes the same subjects as can(): no set on patient
people.list(setOf({ type: 'patient', id: 'p1' }, 'managers'), 'edit', 'staff');

// @ts-expect-error 48. staff has managers, and no relation named nope
people.can(setOf(staff, 'nope'), 'edit', staff);

// A gap, named in the README: can() and list() take null as well, and a union
// with null turns off the check of an object literal, so this compiles — and
// asks about the user staff:u1, not the set. grant() and revoke() refuse it (42).
people.can({ type: 'staff', id: 'u1', relation: 'managers' }, 'edit', staff);

async function usersAsObjects() {
	return [
		// A user is the object: its managers edit it.
		await people.can(staff, 'edit', staff),
		await people.grant(staff, 'managers', { type: 'staff', id: 'u2' }),
		await people.grant(staff, 'managers', setOf(staff, 'managers')),
		await people.grant(note, 'readers', setOf(staff, 'managers')),
		await people.grant(note, 'owners', staff),
		// A set is a subject of can() and list() too.
		await people.can(setOf(staff, 'managers'), 'edit', staff),
		await people.list(setOf(staff, 'managers'), 'edit', 'staff'),
		await access.can(
			{ type: 'team', id: 't', relation: 'members' },
			'view',
			record,
			{ ctx: { onShift: true } },
		),
		// On an object type, setOf() writes the set a plain object would.
		await access.grant(
			record,
			'viewers',
			setOf({ type: 'team', id: 't' }, 'members'),
		),
	];
}

export const checked = { clinic, allowed, usersAsObjects };
