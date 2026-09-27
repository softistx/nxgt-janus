/** Cases 42–48: a user type that is also an object type, and its subject sets. See `fixtures.ts`. */

import {
	createMemoryRelations,
	defineModel,
	permissions,
} from '../../../src/permissions/index';
import { setOf } from '../../../src/subjects/subject';
import { access, record, staff, subjects } from './fixtures';

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

export const checked = { usersAsObjects };
