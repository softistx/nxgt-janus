import { describe, expect, it } from 'bun:test';
import { permissions } from './engine';
import { everyPage, modelOver, type Rows } from './list.fixtures';
import { createMemoryRelations } from './port/memory';

/** mulberry32: a seeded generator, so a failing graph can be replayed. */
const generator = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('list() is can() over every object', () => {
	const seeds = Array.from({ length: 40 }, (_, n) => n + 1);

	for (const seed of seeds) {
		it(`agrees with can() on random graph ${seed}`, async () => {
			const random = generator(seed);
			const pick = <T>(items: readonly T[]): T =>
				items[Math.floor(random() * items.length)] as T;
			const ids = (prefix: string, count: number) =>
				Array.from({ length: count }, (_, n) => `${prefix}${n}`);

			// Shared ids: patient u0 and staff u0 are two people.
			const staffIds = ids('u', 4);
			const patientIds = ids('u', 3);
			const teamIds = ids('t', 4);
			const folderIds = ids('f', 4);
			const recordIds = ids('r', 6);
			const noteIds = ids('n', 4);

			const rows: Rows = new Map<
				string,
				Readonly<Record<string, string | null>>
			>([
				...recordIds.map(
					(id) =>
						[
							id,
							{
								patientId: random() < 0.6 ? pick(patientIds) : null,
								doctorId: random() < 0.6 ? pick(staffIds) : null,
							},
						] as const,
				),
				...noteIds.map(
					(id) =>
						[id, { teamId: random() < 0.7 ? pick(teamIds) : null }] as const,
				),
			]);
			const store = createMemoryRelations();
			const access = permissions({ model: modelOver(rows), store });
			// The same grants, without the tuples the model does not admit.
			const clean = permissions({
				model: modelOver(rows),
				store: createMemoryRelations(),
			});
			const grant = (async (object: never, relation: never, subject: never) => {
				await clean.grant(object, relation, subject);
				await access.grant(object, relation, subject);
			}) as typeof access.grant;

			const staff = (id: string) => ({ type: 'staff' as const, id });
			const team = (id: string) => ({ type: 'team' as const, id });
			const folder = (id: string) => ({ type: 'folder' as const, id });
			const members = (id: string) => ({
				type: 'team' as const,
				id,
				relation: 'members' as const,
			});
			const record = (id: string) => ({ type: 'record' as const, id });

			for (let n = 0; n < 30; n += 1) {
				switch (Math.floor(random() * 8)) {
					case 0:
						await grant(team(pick(teamIds)), 'members', staff(pick(staffIds)));
						break;
					case 1:
						// Cycles included: a team may end up a member of itself.
						await grant(team(pick(teamIds)), 'members', members(pick(teamIds)));
						break;
					case 2:
						await grant(team(pick(teamIds)), 'leads', staff(pick(staffIds)));
						break;
					case 3:
						await grant(
							folder(pick(folderIds)),
							'parents',
							folder(pick(folderIds)),
						);
						break;
					case 4:
						await grant(
							folder(pick(folderIds)),
							'owners',
							staff(pick(staffIds)),
						);
						break;
					case 5:
						await grant(record(pick(recordIds)), 'teams', team(pick(teamIds)));
						break;
					case 6:
						await grant(
							record(pick(recordIds)),
							'folders',
							folder(pick(folderIds)),
						);
						break;
					default:
						await grant(
							record(pick(recordIds)),
							'viewers',
							random() < 0.5 ? staff(pick(staffIds)) : members(pick(teamIds)),
						);
				}
			}

			// Stored past grant(), and admitted nowhere: each grants nothing.
			const stale = (
				object: { type: string; id: string },
				relation: string,
				subject: { type: string; id: string; relation?: string },
			) => store.write({ add: [{ object, relation, subject }] });
			for (let n = 0; n < 12; n += 1) {
				const kind = Math.floor(random() * 6);
				if (kind === 0)
					await stale(record(pick(recordIds)), 'viewers', team(pick(teamIds)));
				if (kind === 1)
					await stale(record(pick(recordIds)), 'teams', members(pick(teamIds)));
				if (kind === 2)
					await stale(record(pick(recordIds)), 'folders', team(pick(teamIds)));
				if (kind === 3)
					await stale(team(pick(teamIds)), 'members', {
						...members(pick(teamIds)),
						relation: 'leads',
					});
				if (kind === 4)
					await stale(folder(pick(folderIds)), 'owners', {
						type: 'patient',
						id: pick(patientIds),
					});
				if (kind === 5)
					await stale(record(pick(recordIds)), 'viewers', {
						type: 'folder',
						id: pick(folderIds),
						relation: 'owners',
					});
			}

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
					[
						'patients',
						'doctors',
						'teams',
						'folders',
						'viewers',
						'view',
						'edit',
					],
				],
				['note', noteIds, ['teams', 'view']],
			] as const;

			for (const onShift of [true, false]) {
				const ctx = { onShift };
				for (const subject of subjects) {
					for (const [type, objects, names] of questions) {
						for (const name of names) {
							const expected: string[] = [];
							for (const id of objects) {
								const object = { type, id, ...rows.get(id) };
								const granted = await access.can(
									subject,
									name as never,
									object as never,
									{ ctx } as never,
								);
								expect(granted).toBe(
									await clean.can(
										subject,
										name as never,
										object as never,
										{ ctx } as never,
									),
								);
								if (granted) expected.push(id);
							}
							const listed = await everyPage((after) =>
								access.list(subject, name as never, type, {
									ctx,
									after,
									limit: 2,
								} as never),
							);
							expect({ subject, name, type, ids: listed }).toEqual({
								subject,
								name,
								type,
								ids: expected,
							});
						}
					}
				}
			}
		});
	}
});
