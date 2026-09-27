/** Cases 9–16: a question the model cannot answer. See `fixtures.ts`. */

import { can, record, staff } from './fixtures';

// ─── The questions ────────────────────────────────────────────────────────

// @ts-expect-error 9. a permission record does not declare
can(staff, 'edti', record, { ctx: { onShift: true } });

// @ts-expect-error 10. a permission of team, asked of a record
can(staff, 'manage', record);

can(
	staff,
	'view',
	// @ts-expect-error 11. a record without doctorId: the doctors relation could never hold
	{ type: 'record', id: 'r1', patientId: 'p1' },
	{ ctx: { onShift: true } },
);

// @ts-expect-error 12. edit is conditional, and no ctx is given
can(staff, 'edit', record);

// @ts-expect-error 13. view reaches edit's condition, so it needs the ctx too
can(staff, 'view', record);

// @ts-expect-error 14. the ctx has the wrong shape
can(staff, 'edit', record, { ctx: { onshift: true } });

// @ts-expect-error 15. "visitor" is neither a user type nor an object type
can({ type: 'visitor', id: 'v' }, 'view', { type: 'team', id: 't' });

// @ts-expect-error 16. "ward" is not an object type of the model
can(staff, 'view', { type: 'ward', id: 'w' });
