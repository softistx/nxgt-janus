/**
 * What the permission model refuses at COMPILE time, seen from the
 * application writing one and asking it questions.
 *
 * Checked by `tsc --noEmit`, never run — see `../refusals.ts` for why a
 * `@ts-expect-error` is the unit of measurement. Each would otherwise surface
 * as a permission that silently never grants: a typo in a relation, an arrow
 * to a permission its target lacks, an object passed without the field a
 * `fromField` reads, a condition asked without its context.
 *
 * **Forty-eight plausible mistakes, forty-eight refused**, numbered across the
 * files of this folder, one per behaviour; this one holds only what they
 * share. Each is verified to fail for the reason its comment names — a
 * refusal that fails for another reason proves nothing. Add a case whenever
 * the model gains something it should refuse; never delete one to make a
 * change pass.
 */

import {
	type Can,
	type ConfigOf,
	createMemoryRelations,
	defineModel,
	fromField,
	permissions,
	when,
} from '../../../src/permissions/index';

/** What `auth.types` answers for a clinic with two user types. */
export const subjects = ['patient', 'staff'] as const;

export const clinic = defineModel({
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

export declare const can: Can<ConfigOf<typeof clinic>>;
export const staff = { type: 'staff', id: 'u1' } as const;
export const record = {
	type: 'record',
	id: 'r1',
	patientId: 'p1',
	doctorId: null,
} as const;

export const access = permissions({
	model: clinic,
	store: createMemoryRelations(),
});

export const ward = permissions({
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
