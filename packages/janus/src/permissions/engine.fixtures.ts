import { mintId } from '../ids/id';
import { permissions } from './engine';
import { defineModel } from './model/define';
import { fromField } from './model/from-field';
import { when } from './model/when';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

/** The clinic every `engine.*.spec.ts` asks its questions of. */
export const model = defineModel({
	subjects: ['patient', 'staff'],
	types: {
		team: {
			related: { members: ['staff', 'team#members'], leads: ['staff'] },
			permits: { manage: ['leads'], view: ['members', 'manage'] },
		},
		folder: {
			related: { parents: ['folder'], owners: ['staff'] },
			permits: { view: ['owners', 'parents->view'] },
		},
		record: {
			related: {
				patients: fromField('patientId', 'patient'),
				doctors: fromField('doctorId', 'staff'),
				teams: ['team'],
				folders: ['folder'],
				viewers: ['staff', 'team#members'],
			},
			permits: {
				view: ['patients', 'viewers', 'teams->view', 'folders->view', 'edit'],
				edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
			},
		},
	},
});

export const staff = () => ({ type: 'staff' as const, id: mintId() });
export const patient = () => ({ type: 'patient' as const, id: mintId() });
export const team = () => ({ type: 'team' as const, id: mintId() });
export const folder = () => ({ type: 'folder' as const, id: mintId() });
export const record = (
	fields: { patientId?: string | null; doctorId?: string | null } = {},
) => ({
	type: 'record' as const,
	id: mintId(),
	patientId: fields.patientId ?? null,
	doctorId: fields.doctorId ?? null,
});
export const offShift = { ctx: { onShift: false } };

export const setup = (
	store: RelationStore = createMemoryRelations(),
	maxDepth?: number,
) =>
	permissions({
		model,
		store,
		...(maxDepth === undefined ? {} : { maxDepth }),
	});

/** A store whose every method throws: proof that no store was asked. */
export const untouchable = () =>
	new Proxy(createMemoryRelations(), {
		get: (target, method) =>
			typeof target[method as keyof RelationStore] === 'function'
				? () => {
						throw new Error(`called ${String(method)}`);
					}
				: undefined,
	});
