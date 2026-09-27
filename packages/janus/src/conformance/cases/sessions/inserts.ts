import { equal } from '../../assert';
import { sessionRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'sessions';

/** What an insert writes, and what retrying it writes: nothing. */
export const sessionInsertCases: readonly ConformanceCase[] = [
	{
		id: 'sessions.idempotentInsert',
		group,
		name: 'is idempotent under retry: inserting an existing session id writes nothing',
		async run({ stores }) {
			const record = sessionRecord();
			await stores.sessions.insertSession(record);
			await stores.sessions.insertSession({
				...record,
				expiresAt: new Date('2099-06-01T00:00:00.000Z'),
			});

			equal(
				await stores.sessions.findSessionByTokenHash(record.tokenHash),
				record,
				'insertSession retried with the same id should write nothing',
			);
		},
	},
];
