import type { UserRecord } from '../../auth/port/types';
import { NotFoundError, StoreConflict } from '../../errors/janus-error';
import { mintId } from '../../ids/id';
import { equal, isNull, isOurs, ok, rejects } from '../assert';
import { at, userRecord } from '../fixtures';
import type { ConformanceCase } from '../types';

const group = 'users';

export const userStoreCases: readonly ConformanceCase[] = [
	{
		id: 'users.roundTrip',
		group,
		name: 'round-trips a record byte for byte: nested fields, a 1 that stays a number, a "1" that stays a string',
		async run({ stores }) {
			const record = userRecord({
				fields: {
					email: 'Ada@Example.test',
					name: { first: 'Ada', last: 'Lovelace' },
					count: 1,
					code: '1',
					zero: 0,
					flags: [true, false, null],
					note: '  spaced  ',
					unicode: 'Ｂob — ÿ',
					nested: { deep: { deeper: [1, { two: 2 }] } },
					tags: ['a', 'b'],
				},
				emailVerifiedAt: at('2026-01-02T00:00:00.000Z'),
			});

			equal(
				await stores.users.insertUser(record),
				record,
				'insertUser should answer the record as stored',
			);
			equal(
				await stores.users.findUser(record.id),
				record,
				'findUser should answer the record exactly as it was written',
			);
		},
	},
	{
		id: 'users.absence',
		group,
		name: 'answers null for an absence, never undefined, and an empty page for an empty store',
		async run({ stores }) {
			isNull(
				await stores.users.findUser(mintId()),
				'findUser for an unknown id',
			);
			isNull(
				await stores.users.findUserByLogin('user', 'nobody@example.test'),
				'findUserByLogin for an unknown login',
			);
			equal(
				await stores.users.listUsers({ type: 'user', after: null, limit: 10 }),
				{ items: [], nextCursor: null },
				'listUsers on an empty store should answer an empty page',
			);
		},
	},
	{
		id: 'users.loginBytes',
		group,
		name: 'compares logins as bytes, within one type: no case folding, no trimming, no collation',
		async run({ stores }) {
			const upper = userRecord({ logins: ['Ada@Example.test'] });
			const lower = userRecord({ logins: ['ada@example.test'] });
			const staff = userRecord({ type: 'staff', logins: ['ada@example.test'] });

			for (const record of [upper, lower, staff]) {
				await stores.users.insertUser(record);
			}

			equal(
				(await stores.users.findUserByLogin('user', 'Ada@Example.test'))?.id,
				upper.id,
				'findUserByLogin should find the login with its exact bytes',
			);
			equal(
				(await stores.users.findUserByLogin('user', 'ada@example.test'))?.id,
				lower.id,
				'findUserByLogin should tell "Ada@…" from "ada@…": normalisation is the core’s',
			);
			equal(
				(await stores.users.findUserByLogin('staff', 'ada@example.test'))?.id,
				staff.id,
				'uniqueness is of (type, login): the same login under another type is another user',
			);
		},
	},
	{
		id: 'users.idempotentInsert',
		group,
		name: 'is idempotent under retry: inserting an existing id answers the stored record and writes nothing',
		async run({ stores }) {
			const record = userRecord();
			await stores.users.insertUser(record);

			const retried = await stores.users.insertUser({
				...record,
				fields: { email: 'changed@example.test' },
			});

			equal(
				retried,
				record,
				'insertUser retried with the same id should answer the stored record',
			);
			equal(
				await stores.users.findUser(record.id),
				record,
				'insertUser retried should write nothing',
			);
		},
	},
	{
		id: 'users.uniqueness',
		group,
		name: 'lets exactly one of twenty concurrent inserts hold a login: uniqueness is a constraint, not a read',
		async run({ stores }) {
			const records = Array.from({ length: 20 }, () =>
				userRecord({ logins: ['contested@example.test'] }),
			);

			const outcomes = await Promise.allSettled(
				records.map((record) => stores.users.insertUser(record)),
			);
			const accepted = outcomes.filter((o) => o.status === 'fulfilled');
			const refused = outcomes.flatMap((o) =>
				o.status === 'rejected' ? [o.reason as unknown] : [],
			);

			equal(
				accepted.length,
				1,
				'insertUser: of twenty concurrent inserts of one login, exactly one should be accepted — a read followed by a write lets several through',
			);
			for (const error of refused) {
				isOurs(
					error,
					StoreConflict,
					'insertUser should refuse a taken login with StoreConflict',
				);
				equal(error.code, 'LOGIN_TAKEN', 'insertUser: the conflict code');
				equal(
					error.login,
					'contested@example.test',
					'insertUser: the conflict should name the login',
				);
				ok(
					!error.message.includes('contested@example.test'),
					`insertUser: the conflict's message should not quote the login — a message never carries a value; got ${JSON.stringify(error.message)}`,
				);
			}
			let stored = 0;
			for (const record of records) {
				if ((await stores.users.findUser(record.id)) !== null) stored += 1;
			}
			equal(stored, 1, 'insertUser: a refused insert should write nothing');
		},
	},
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
				'updateUser on an unknown id should reject with NotFoundError, not a version conflict',
			);
		},
	},
	{
		id: 'users.omission',
		group,
		name: 'omission — the Kratos PUT trap: an update leaves every field it does not name exactly as it was',
		async run({ stores }) {
			const record = userRecord({
				fields: { email: 'kept@example.test', plan: 'pro' },
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
				'updateUser naming only schemaVersion should leave active, fields, logins, password and emailVerifiedAt untouched',
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
	{
		id: 'users.pagination',
		group,
		name: 'pages 25 users of one type by 10 in ascending id order, with no gap, no repeat and no other type, and ends on a null cursor',
		async run({ stores }) {
			const records = Array.from({ length: 25 }, () => userRecord());
			const others = Array.from({ length: 5 }, () =>
				userRecord({ type: 'staff' }),
			);
			// Written newest first, and interleaved with another type, so neither
			// insertion order nor the whole collection is the answer.
			for (const [index, record] of [...records].reverse().entries()) {
				await stores.users.insertUser(record);
				const other = others[index];
				if (other !== undefined) await stores.users.insertUser(other);
			}
			const expected = records.map((record) => record.id).sort();

			const seen: string[] = [];
			const sizes: number[] = [];
			let after: string | null = null;
			for (let page = 0; page < 10; page += 1) {
				const answer = await stores.users.listUsers({
					type: 'user',
					after,
					limit: 10,
				});
				seen.push(...answer.items.map((item) => item.id));
				sizes.push(answer.items.length);
				after = answer.nextCursor;
				if (after === null) break;
			}

			equal(sizes, [10, 10, 5], 'listUsers: page sizes for 25 users by 10');
			equal(
				seen,
				expected,
				'listUsers: every id of the type once, in ascending order',
			);

			// The cursor need not name a stored user.
			const between = await stores.users.listUsers({
				type: 'user',
				after: '00000000-0000-7000-8000-000000000000',
				limit: 3,
			});
			ok(
				between.items[0]?.id === expected[0],
				'listUsers: a cursor naming no stored user should start after it, not fail',
			);
		},
	},
	{
		id: 'users.delete',
		group,
		name: 'deletes a user and frees their logins, answers false for nobody, and touches no other user',
		async run({ stores }) {
			const record = userRecord();
			const other = userRecord();
			await stores.users.insertUser(record);
			await stores.users.insertUser(other);
			const [login] = record.logins;

			equal(
				await stores.users.deleteUser(record.id),
				true,
				'deleteUser for a stored user should answer true',
			);
			isNull(
				await stores.users.findUser(record.id),
				'findUser after deleteUser',
			);
			isNull(
				await stores.users.findUserByLogin(record.type, login ?? ''),
				'findUserByLogin for a deleted user’s login',
			);
			equal(
				await stores.users.deleteUser(record.id),
				false,
				'deleteUser replayed should answer false, not fail: a deletion interrupted half-way is replayed',
			);
			equal(
				await stores.users.findUser(other.id),
				other,
				'deleteUser should not touch another user',
			);
			// The login is free for a new account: the index forgot it.
			const successor = userRecord({ logins: [login ?? ''] });
			equal(
				await stores.users.insertUser(successor),
				successor,
				'insertUser onto a deleted user’s login should succeed',
			);
		},
	},
];
