import { permissions } from './engine';
import { defineModel } from './model/define';
import { fromField } from './model/from-field';
import { when } from './model/when';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

/** The fields of the objects of one test, by id: what an application's tables hold. */
export type Rows = Map<string, Row>;
type Row = Readonly<Record<string, string | null>>;

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

/** mulberry32: a seeded generator, so a failing graph can be replayed. */
const generator = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const ids = (prefix: string, count: number) =>
	Array.from({ length: count }, (_, n) => `${prefix}${n}`);

// Shared ids: patient u0 and staff u0 are two people.
const staffIds = ids('u', 4);
const patientIds = ids('u', 3);
const teamIds = ids('t', 4);
const folderIds = ids('f', 4);
const recordIds = ids('r', 6);
const noteIds = ids('n', 4);

const staff = (id: string) => ({ type: 'staff' as const, id });
const team = (id: string) => ({ type: 'team' as const, id });
const folder = (id: string) => ({ type: 'folder' as const, id });
const members = (id: string) => ({ ...team(id), relation: 'members' as const });
const record = (id: string) => ({ type: 'record' as const, id });

/** Picks from a list with the graph's own generator. */
type Pick = <T>(items: readonly T[]) => T;

/** The fields of the records and notes: who each names, if anyone. */
function rowsOf(random: () => number, pick: Pick): Rows {
	const maybe = (odds: number, from: readonly string[]) =>
		random() < odds ? pick(from) : null;
	return new Map([
		...recordIds.map((id): [string, Row] => [
			id,
			{ patientId: maybe(0.6, patientIds), doctorId: maybe(0.6, staffIds) },
		]),
		...noteIds.map((id): [string, Row] => [
			id,
			{ teamId: maybe(0.7, teamIds) },
		]),
	]);
}

type Grant = ReturnType<typeof setup>['grant'];

/** One drawn subject or object of each kind: each call picks anew. */
const draws = (pick: Pick) => ({
	aStaff: () => staff(pick(staffIds)),
	aTeam: () => team(pick(teamIds)),
	aSet: () => members(pick(teamIds)),
	aFolder: () => folder(pick(folderIds)),
	aRecord: () => record(pick(recordIds)),
});

/** Thirty grants, each through grant(), so each is one the model admits. */
async function grantAtRandom(grant: Grant, random: () => number, pick: Pick) {
	const { aStaff, aTeam, aSet, aFolder, aRecord } = draws(pick);
	for (let n = 0; n < 30; n += 1) {
		switch (Math.floor(random() * 8)) {
			case 0:
				await grant(aTeam(), 'members', aStaff());
				break;
			case 1:
				// Cycles included: a team may end up a member of itself.
				await grant(aTeam(), 'members', aSet());
				break;
			case 2:
				await grant(aTeam(), 'leads', aStaff());
				break;
			case 3:
				await grant(aFolder(), 'parents', aFolder());
				break;
			case 4:
				await grant(aFolder(), 'owners', aStaff());
				break;
			case 5:
				await grant(aRecord(), 'teams', aTeam());
				break;
			case 6:
				await grant(aRecord(), 'folders', aFolder());
				break;
			default:
				await grant(aRecord(), 'viewers', random() < 0.5 ? aStaff() : aSet());
		}
	}
}

/** Twelve tuples stored past grant(), and admitted nowhere: each grants nothing. */
async function writeStale(
	store: RelationStore,
	random: () => number,
	pick: Pick,
) {
	const { aTeam, aSet, aFolder, aRecord } = draws(pick);
	const stale = (
		object: { type: string; id: string },
		relation: string,
		subject: { type: string; id: string; relation?: string },
	) => store.write({ add: [{ object, relation, subject }] });
	for (let n = 0; n < 12; n += 1) {
		const kind = Math.floor(random() * 6);
		if (kind === 0) await stale(aRecord(), 'viewers', aTeam());
		if (kind === 1) await stale(aRecord(), 'teams', aSet());
		if (kind === 2) await stale(aRecord(), 'folders', aTeam());
		if (kind === 3)
			await stale(aTeam(), 'members', { ...aSet(), relation: 'leads' });
		if (kind === 4)
			await stale(aFolder(), 'owners', {
				type: 'patient',
				id: pick(patientIds),
			});
		if (kind === 5)
			await stale(aRecord(), 'viewers', {
				type: 'folder',
				id: pick(folderIds),
				relation: 'owners',
			});
	}
}

/**
 * A graph built from `seed`: `access` holds it with the stale tuples, `clean`
 * the same grants without them, and `subjects` and `questions` are all there
 * is to ask of it.
 */
export async function randomGraph(seed: number) {
	const random = generator(seed);
	const pick: Pick = (items) =>
		items[Math.floor(random() * items.length)] as never;
	const rows = rowsOf(random, pick);
	const store = createMemoryRelations();
	const access = permissions({ model: modelOver(rows), store });
	// The same grants, without the tuples the model does not admit.
	const clean = permissions({
		model: modelOver(rows),
		store: createMemoryRelations(),
	});
	const both = (async (object: never, relation: never, subject: never) => {
		await clean.grant(object, relation, subject);
		await access.grant(object, relation, subject);
	}) as Grant;
	await grantAtRandom(both, random, pick);
	await writeStale(store, random, pick);

	const subjects = [
		...staffIds.map(staff),
		...patientIds.map((id) => ({ type: 'patient' as const, id })),
		...teamIds.map(team),
		...teamIds.map(members),
		...folderIds.map(folder),
	];
	const questions = [
		['team', teamIds, ['members', 'leads', 'manage', 'view']],
		['folder', folderIds, ['parents', 'owners', 'view']],
		[
			'record',
			recordIds,
			['patients', 'doctors', 'teams', 'folders', 'viewers', 'view', 'edit'],
		],
		['note', noteIds, ['teams', 'view']],
	] as const;
	return { rows, access, clean, subjects, questions };
}
