import { StoreConflict } from '../../../errors/janus-error';
import { equal, isOurs, ok } from '../../assert';
import { userRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'users';

/** What an insert does twice: nothing under a retry, one winner under a race. */
export const userInsertCases: readonly ConformanceCase[] = [
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
					'StoreConflict',
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
];
