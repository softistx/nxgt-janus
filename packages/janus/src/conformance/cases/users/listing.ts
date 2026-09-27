import { equal, ok } from '../../assert';
import { userRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'users';

/** How the users of one type are paged. */
export const userListingCases: readonly ConformanceCase[] = [
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
];
