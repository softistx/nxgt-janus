import { permissions } from './engine';
import { defineModel } from './model/define';
import { fromField } from './model/from-field';
import { when } from './model/when';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

/** The fields of the objects of one test, by id: what an application's tables hold. */
export type Rows = Map<string, Readonly<Record<string, string | null>>>;

export const modelOver = (rows: Rows) => {
	const naming = (field: string) => async (id: string) =>
		[...rows].filter(([, row]) => row[field] === id).map(([key]) => key);
	return defineModel({
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
					patients: fromField('patientId', 'patient', {
						lookup: naming('patientId'),
					}),
					doctors: fromField('doctorId', 'staff', {
						lookup: naming('doctorId'),
					}),
					teams: ['team'],
					folders: ['folder'],
					viewers: ['staff', 'team#members'],
				},
				permits: {
					view: ['patients', 'viewers', 'teams->view', 'folders->view', 'edit'],
					edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
				},
			},
			// An arrow through a fromField: list() reverses it with the lookup.
			note: {
				related: {
					teams: fromField('teamId', 'team', { lookup: naming('teamId') }),
				},
				permits: { view: ['teams->view'] },
			},
		},
	});
};

/** Every page of a list, read with a small limit so paging is walked too. */
export async function everyPage(
	read: (after: string | null) => Promise<{
		items: readonly string[];
		nextCursor: string | null;
	}>,
): Promise<string[]> {
	const ids: string[] = [];
	let after: string | null = null;
	do {
		const page = await read(after);
		ids.push(...page.items);
		after = page.nextCursor;
	} while (after !== null);
	return ids;
}

/** The engine every `describe('list()')` asks, over a model with no rows. */
export const setup = (
	store: RelationStore = createMemoryRelations(),
	maxDepth?: number,
) =>
	permissions({
		model: modelOver(new Map()),
		store,
		...(maxDepth === undefined ? {} : { maxDepth }),
	});

export const ada = { type: 'staff', id: 'ada' } as const;
