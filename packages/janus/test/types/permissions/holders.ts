/** Cases 53–57: the holders of a relation, listed by pages. See `fixtures.ts`. */

import { access, record, staff } from './fixtures';

// ─── Listing holders ──────────────────────────────────────────────────────

const team = { type: 'team', id: 't' } as const;

// Must keep compiling: a stored relation, every option.
access.holders(team, 'members', {
	first: 10,
	after: null,
	search: 'ada',
	matches: (holder) => holder.id.startsWith('u'),
});

// Must keep compiling: the batched predicate and a scan budget.
access.holders(team, 'members', {
	matchesMany: async (holders) => holders.map((holder) => holder.id === 'u1'),
	scanLimit: 200,
});

// @ts-expect-error 53. doctors is read from doctorId: no tuple holds it
access.holders(record, 'doctors');

// @ts-expect-error 54. view is a permission, not a relation anyone holds
access.holders(record, 'view');

// @ts-expect-error 55. staff is no object type of the model
access.holders(staff, 'members');

// @ts-expect-error 56. first is a number
access.holders(team, 'members', { first: '10' });

// @ts-expect-error 57. matches takes a holder and answers a boolean
access.holders(team, 'members', { matches: (holder: number) => holder > 0 });

// @ts-expect-error 58. matchesMany answers one boolean per holder, not one boolean
access.holders(team, 'members', { matchesMany: () => true });

// @ts-expect-error 59. scanLimit is a number
access.holders(team, 'members', { scanLimit: '500' });

// 60. matchesMany takes the batch, not one holder
access.holders(team, 'members', {
	// @ts-expect-error 60. matchesMany takes the batch, not one holder
	matchesMany: (holder: number) => [holder > 0],
});
