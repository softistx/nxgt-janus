import { equal, isNull } from '../../assert';
import { userRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'users';

/** What a deletion removes, and what it leaves. */
export const userDeletionCases: readonly ConformanceCase[] = [
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
