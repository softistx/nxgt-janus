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
