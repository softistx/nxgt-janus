import type { UserRecord } from '../../../auth/port/types';
import { NotFoundError, StoreConflict } from '../../../errors/janus-error';
import { mintId } from '../../../ids/id';
import { equal, isOurs, rejects } from '../../assert';
import { at, userRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'users';

/**
 * How an update is guarded: applied at the expected version, refused at a
 * stale one, and refused apart from both for an id nobody holds.
 */
export const userVersionCases: readonly ConformanceCase[] = [
	{
		id: 'users.versionIncrements',
		group,
		name: 'applies an update at the expected version, and answers the record written with its version one higher',
		async run({ stores }) {
			const record = userRecord();
			await stores.users.insertUser(record);

			const written = await stores.users.updateUser(
				record.id,
				{ updatedAt: at('2026-02-01T00:00:00.000Z'), active: false },
				0,
			);
			const expected: UserRecord = {
				...record,
				active: false,
				version: 1,
				updatedAt: at('2026-02-01T00:00:00.000Z'),
			};

			equal(
				written,
				expected,
				'updateUser should answer the record as written',
			);
			equal(
				await stores.users.findUser(record.id),
				expected,
				'findUser after updateUser',
			);
		},
	},
	{
		id: 'users.versionConflict',
		group,
		name: 'refuses a stale version with both versions, and leaves the record identical byte for byte',
		async run({ stores }) {
			const record = userRecord();
			await stores.users.insertUser(record);
			await stores.users.updateUser(
				record.id,
				{ updatedAt: at('2026-02-01T00:00:00.000Z'), active: false },
				0,
			);
			const before = await stores.users.findUser(record.id);

			const error = await rejects(
				stores.users.updateUser(
					record.id,
					{
						updatedAt: at('2026-03-01T00:00:00.000Z'),
						active: true,
						fields: { email: 'overwritten@example.test' },
					},
					0,
				),
				'updateUser at a stale version should reject',
			);

			isOurs(
				error,
				StoreConflict,
				'StoreConflict',
				'updateUser at a stale version should reject with StoreConflict',
			);
			equal(error.code, 'VERSION_CONFLICT', 'updateUser: the conflict code');
			equal(error.expectedVersion, 0, 'updateUser: expectedVersion');
			equal(error.actualVersion, 1, 'updateUser: actualVersion');
			// A partial write that also reports a conflict is the worst of both.
			equal(
				await stores.users.findUser(record.id),
				before,
				'updateUser refused for its version should have written nothing',
			);
		},
	},
	{
		id: 'users.unknownUpdate',
		group,
		name: 'refuses an update to an unknown id with NotFoundError, told apart from a version conflict',
		async run({ stores }) {
			const error = await rejects(
				stores.users.updateUser(
					mintId(),
					{ updatedAt: at('2026-02-01T00:00:00.000Z') },
					0,
				),
				'updateUser on an unknown id should reject',
			);

			isOurs(
				error,
				NotFoundError,
				'NotFoundError',
				'updateUser on an unknown id should reject with NotFoundError, not a version conflict',
			);
		},
	},
];
