import { StoreConflict } from '../../../errors/janus-error';
import { equal, isNull, isOurs, rejects } from '../../assert';
import { at, userRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'users';

/** A second factor as the core writes it: the secret sealed, opaque to a store. */
const secondFactor = {
	method: 'totp',
	secret: 'v1.2026-09.aXY.Y2lwaGVydGV4dA',
	confirmedAt: null,
	lastStep: null,
} as const;

/**
 * What a patch writes: the fields it names, and nothing else — a field left
 * out is kept, a slot named `null` is removed, a login moved away is freed.
 */
export const userPatchCases: readonly ConformanceCase[] = [
	{
		id: 'users.omission',
		group,
		name: 'omission — the Kratos PUT trap: an update leaves every field it does not name exactly as it was',
		async run({ stores }) {
			const record = userRecord({
				fields: { email: 'kept@example.test', plan: 'pro' },
				secondFactor: {
					...secondFactor,
					confirmedAt: at('2026-01-03T00:00:00.000Z'),
					lastStep: 59_000_000,
				},
				emailVerifiedAt: at('2026-01-02T00:00:00.000Z'),
			});
			await stores.users.insertUser(record);

			const written = await stores.users.updateUser(
				record.id,
				{ updatedAt: at('2026-02-01T00:00:00.000Z'), schemaVersion: '2' },
				0,
			);

			equal(
				written,
				{
					...record,
					schemaVersion: '2',
					version: 1,
					updatedAt: at('2026-02-01T00:00:00.000Z'),
				},
				'updateUser naming only schemaVersion should leave active, fields, logins, password, secondFactor and emailVerifiedAt untouched',
			);
		},
	},
	{
		id: 'users.passwordSlot',
		group,
		name: 'keeps a password the patch does not name, and removes one the patch names null',
		async run({ stores }) {
			const record = userRecord();
			await stores.users.insertUser(record);

			const kept = await stores.users.updateUser(
				record.id,
				{ updatedAt: at('2026-02-01T00:00:00.000Z') },
				0,
			);
			equal(
				kept.password,
				record.password,
				'updateUser not naming password should keep it',
			);

			const removed = await stores.users.updateUser(
				record.id,
				{ updatedAt: at('2026-02-02T00:00:00.000Z'), password: null },
				1,
			);
			isNull(
				removed.password,
				'updateUser with password: null should remove the password',
			);
		},
	},
	{
		id: 'users.secondFactorSlot',
		group,
		name: 'round-trips a second factor, keeps it when a patch does not name it, and removes it when the patch names null',
		async run({ stores }) {
			const record = userRecord({ secondFactor });
			equal(
				await stores.users.insertUser(record),
				record,
				'insertUser should answer a pending second factor as written: confirmedAt and lastStep null',
			);

			const confirmed = {
				...secondFactor,
				confirmedAt: at('2026-02-01T00:00:00.000Z'),
				lastStep: 59_000_000,
			};
			equal(
				(
					await stores.users.updateUser(
						record.id,
						{
							updatedAt: at('2026-02-01T00:00:00.000Z'),
							secondFactor: confirmed,
						},
						0,
					)
				).secondFactor,
				confirmed,
				'updateUser naming secondFactor should replace it whole',
			);
			equal(
				(
					await stores.users.updateUser(
						record.id,
						{ updatedAt: at('2026-02-02T00:00:00.000Z') },
						1,
					)
				).secondFactor,
				confirmed,
				'updateUser not naming secondFactor should keep it',
			);
			equal(
				(await stores.users.findUser(record.id))?.secondFactor,
				confirmed,
				'findUser should answer the second factor as written',
			);
			isNull(
				(
					await stores.users.updateUser(
						record.id,
						{ updatedAt: at('2026-02-03T00:00:00.000Z'), secondFactor: null },
						2,
					)
				).secondFactor,
				'updateUser with secondFactor: null should remove the second factor',
			);
		},
	},
	{
		id: 'users.loginsMove',
		group,
		name: 'moves logins on update: the old one is free, the new one found, one held elsewhere refused',
		async run({ stores }) {
			const record = userRecord();
			const other = userRecord();
			await stores.users.insertUser(record);
			await stores.users.insertUser(other);
			const [old] = record.logins;
			const moved = 'moved@example.test';

			await stores.users.updateUser(
				record.id,
				{ updatedAt: at('2026-02-01T00:00:00.000Z'), logins: [moved] },
				0,
			);

			isNull(
				await stores.users.findUserByLogin('user', old ?? ''),
				'findUserByLogin for a login the update replaced',
			);
			equal(
				(await stores.users.findUserByLogin('user', moved))?.id,
				record.id,
				'findUserByLogin for the login the update wrote',
			);

			const error = await rejects(
				stores.users.updateUser(
					other.id,
					{ updatedAt: at('2026-02-02T00:00:00.000Z'), logins: [moved] },
					0,
				),
				'updateUser onto a login another user holds should reject',
			);
			isOurs(
				error,
				StoreConflict,
				'StoreConflict',
				'updateUser onto a held login should reject with StoreConflict',
			);
			equal(error.code, 'LOGIN_TAKEN', 'updateUser: the conflict code');
			equal(
				await stores.users.findUser(other.id),
				other,
				'updateUser refused for a login should have written nothing',
			);
		},
	},
];
