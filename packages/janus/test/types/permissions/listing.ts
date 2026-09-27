/** Cases 21–26: a list() nothing can reverse, and a store that cannot answer it. See `fixtures.ts`. */

import {
	createMemoryRelations,
	permissions,
} from '../../../src/permissions/index';
import { access, clinic, staff, ward } from './fixtures';

// ─── Listing ──────────────────────────────────────────────────────────────

// @ts-expect-error 21. view reaches record.doctors, a fromField with no lookup: nothing finds those records
access.list(staff, 'view', 'record', { ctx: { onShift: true } });

// @ts-expect-error 22. a relation read from a field, listed directly, without its lookup
access.list(staff, 'patients', 'record');

// @ts-expect-error 23. use is conditional, and list() needs the ctx as can() does
ward.list(staff, 'use', 'bed');

// @ts-expect-error 24. "view" is no permission of bed
ward.list(staff, 'view', 'bed');

const { findObjects: _dropped, ...withoutFindObjects } =
	createMemoryRelations();

permissions({
	model: clinic,
	// @ts-expect-error 25. a store without findObjects cannot answer list()
	store: withoutFindObjects,
});

permissions({
	model: clinic,
	store: {
		...createMemoryRelations(),
		// @ts-expect-error 26. an absence is false, not null: has answers a boolean
		has: async () => null,
	},
});
