import { mintId } from '../../../ids/id';
import { equal, isNull } from '../../assert';
import { at, userRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'users';

/**
 * What a read answers: the record exactly as written, `null` for an absence,
 * and a login found by its bytes alone.
 */
export const userReadCases: readonly ConformanceCase[] = [
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
		id: 'users.edgeCharacters',
		group,
		name: 'round-trips every character the core lets through: control characters, U+FFFF and a surrogate pair',
		async run({ stores }) {
			const edge = 'a\u0001\u001f\u007f\uFFFF 😀 z';
			const record = userRecord({
				logins: [edge],
				fields: { email: 'ada@example.test', [edge]: [edge, { [edge]: edge }] },
			});

			await stores.users.insertUser(record);
			equal(
				await stores.users.findUser(record.id),
				record,
				'findUser should answer every edge character exactly as written',
			);
			equal(
				(await stores.users.findUserByLogin('user', edge))?.id,
				record.id,
				'findUserByLogin should find a login made of edge characters',
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
];
