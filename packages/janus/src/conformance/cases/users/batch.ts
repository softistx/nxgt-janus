import { mintId } from '../../../ids/id';
import { equal, ok } from '../../assert';
import { userRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'users';

const byId = (a: { id: string }, b: { id: string }) =>
	a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * The optional `findUsers`: several users in one query. Skipped, with the
 * reason, for a store that does not implement it — the core then reads with
 * `findUser`.
 */
export const userBatchCases: readonly ConformanceCase[] = [
	{
		id: 'users.findUsers',
		group,
		name: 'findUsers answers each stored user once, byte for byte and whatever its type, and leaves out an id nobody holds',
		needs: 'findUsers',
		async run({ stores }) {
			const findUsers = stores.users.findUsers;
			ok(findUsers !== undefined, 'findUsers should be present');
			const patient = userRecord({ type: 'patient' });
			const staff = userRecord({ type: 'staff' });
			const other = userRecord();
			for (const record of [patient, staff, other]) {
				await stores.users.insertUser(record);
			}

			const answer = await findUsers?.call(stores.users, [
				staff.id,
				mintId(),
				patient.id,
			]);

			ok(
				Array.isArray(answer),
				'findUsers should answer a list — an absence is a shorter list, never null',
			);
			equal(
				[...(answer ?? [])].sort(byId),
				[patient, staff].sort(byId),
				'findUsers should answer the two stored users exactly as written, and only them',
			);
		},
	},
	{
		id: 'users.findUsersNone',
		group,
		name: 'findUsers answers an empty list, not null, when no id is held',
		needs: 'findUsers',
		async run({ stores }) {
			await stores.users.insertUser(userRecord());

			equal(
				await stores.users.findUsers?.call(stores.users, [mintId(), mintId()]),
				[],
				'findUsers for ids nobody holds should answer []',
			);
		},
	},
];
