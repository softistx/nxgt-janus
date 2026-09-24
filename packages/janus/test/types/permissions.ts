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
 * **Sixteen plausible mistakes, sixteen refused**, each verified to fail for
 * the reason its comment names — a refusal that fails for another reason
 * proves nothing. Add a case whenever the model gains something it should
 * refuse; never delete one to make a change pass.
 */

import {
	type Can,
	type ConfigOf,
	defineModel,
	fromField,
	when,
} from '../../src/permissions/model';

/** What `auth.types` answers for a clinic with two user types. */
const subjects = ['patient', 'staff'] as const;

const clinic = defineModel({
	subjects,
	types: {
		team: {
			relations: { member: ['staff', 'team#member'], lead: ['staff'] },
			permissions: { manage: ['lead'], view: ['member', 'manage'] },
		},
		record: {
			relations: {
				patient: fromField('patientId', 'patient'),
				doctor: fromField('doctorId', 'staff'),
				team: ['team'],
				viewer: ['staff', 'team#member'],
			},
			permissions: {
				view: ['patient', 'doctor', 'viewer', 'team->view', 'edit'],
				edit: [when('doctor', (ctx: { onShift: boolean }) => ctx.onShift)],
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
		team: { relations: { member: ['staf'] } },
	},
});

defineModel({
	subjects,
	types: {
		// @ts-expect-error 2. a subject set naming a relation team does not have
		team: { relations: { member: ['team#membre'] } },
	},
});

defineModel({
	subjects,
	types: {
		record: {
			// @ts-expect-error 3. fromField naming "doctr", not a subject type
			relations: { doctor: fromField('doctorId', 'doctr') },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			relations: { lead: ['staff'] },
			// @ts-expect-error 4. a rule naming no relation or permission
			permissions: { manage: ['leed'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			relations: { lead: ['staff'] },
			// @ts-expect-error 5. a condition on a rule naming nothing
			permissions: { manage: [when('leed', () => true)] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { relations: { lead: ['staff'] } },
		record: {
			relations: { team: ['team'] },
			// @ts-expect-error 6. an arrow to "view", which team does not declare
			permissions: { view: ['team->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		record: {
			relations: { doctor: ['staff'] },
			// @ts-expect-error 7. an arrow through a relation holding users, who have no permissions
			permissions: { view: ['doctor->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			relations: { lead: ['staff'] },
			// @ts-expect-error 8. "lead" names a relation and a permission
			permissions: { lead: ['lead'] },
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
	// @ts-expect-error 11. a record without doctorId: the doctor relation could never hold
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

// ─── What is allowed ──────────────────────────────────────────────────────

async function allowed() {
	return [
		// No condition on team.view: no ctx.
		await can(staff, 'view', { type: 'team', id: 't' }),
		// Anonymous is a question, answered false.
		await can(null, 'manage', { type: 'team', id: 't' }),
		await can(staff, 'edit', record, { ctx: { onShift: false } }),
		// A relation can be asked directly, and a fromField holding nobody is null.
		await can(staff, 'doctor', record),
		// An object can be a subject: a team, member of another team.
		await can({ type: 'team', id: 't' }, 'member', { type: 'team', id: 't2' }),
	];
}

export const checked = { clinic, allowed };
