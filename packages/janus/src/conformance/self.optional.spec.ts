import { describe, expect, it } from 'bun:test';
import {
	allCases,
	describeJanusStores,
	runCase,
	SKIP_REASONS,
} from './describe';
import { referenceHarness } from './reference';
import type { ConformanceHarness } from './types';

/** The reference store, its faults included, without the optional findUsers. */
function withoutFindUsers(): ConformanceHarness {
	const reference = referenceHarness();
	return {
		async open() {
			const opened = await reference.open();
			const { findUsers: _, ...users } = opened.stores.users;
			return { ...opened, stores: { ...opened.stores, users } };
		},
	};
}

// A store that lacks an optional method still passes the whole suite: the
// cases that need it are skipped, with the reason, and every other runs.
describeJanusStores({
	name: 'the reference store without findUsers',
	harness: withoutFindUsers(),
	runner: { describe, it },
});

describe('an optional method a store lacks', () => {
	it('skips every case that needs findUsers, with the reason, faults or not', async () => {
		const needing = allCases.filter((c) =>
			[c.needs].flat().includes('findUsers'),
		);

		expect(needing.map((c) => c.id)).toEqual([
			'users.findUsers',
			'users.findUsersNone',
			'outage.findUsers',
		]);
		for (const conformanceCase of needing) {
			expect(await runCase(conformanceCase, withoutFindUsers())).toEqual({
				skipped: SKIP_REASONS.findUsers,
			});
		}
	});

	it('names faults first when a case needs both and the harness has neither', async () => {
		const outage = allCases.find((c) => c.id === 'outage.findUsers');
		if (outage === undefined) throw new Error('no outage case');
		const bare: ConformanceHarness = {
			open: async () => {
				const opened = await withoutFindUsers().open();
				return { stores: opened.stores };
			},
		};

		expect(await runCase(outage, bare)).toEqual({
			skipped: SKIP_REASONS.faults,
		});
	});
});
