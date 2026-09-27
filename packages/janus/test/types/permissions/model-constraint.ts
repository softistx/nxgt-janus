/** Cases 27–41: model shapes the constraint an editor completes from must still refuse. See `fixtures.ts`. */

import { defineModel, fromField, when } from '../../../src/permissions/index';
import { subjects } from './fixtures';

// ─── Model shapes the constraint refuses ──────────────────────────────────
// defineModel names its choices in a constraint an editor completes
// (completions.model.spec.ts); each case below is one it must still refuse.

/** What `auth.types` answers: an array of the user types, not a tuple. */
declare const authTypes: readonly ('patient' | 'staff')[];

defineModel({
	subjects: authTypes,
	types: {
		// @ts-expect-error 27. "staf" is not a user type of auth.types
		team: { related: { m: ['staf'] } },
	},
});

defineModel({
	subjects: [],
	types: {
		// @ts-expect-error 28. with no subjects, "staff" is no subject type
		team: { related: { m: ['staff'] } },
	},
});

defineModel({
	subjects,
	types: {
		// @ts-expect-error 29. "ward" is no object type
		record: { related: { w: ['ward'] } },
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		// @ts-expect-error 30. a subject set names a relation, never a permission
		record: { related: { v: ['team#view'] } },
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		record: {
			related: { t: fromField('teamId', 'team') },
			// @ts-expect-error 31. an arrow through a fromField to what team lacks
			permits: { v: ['t->nope'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		group: { related: { m: ['staff'] } },
		record: {
			related: { o: ['team', 'group'] },
			// @ts-expect-error 32. an arrow to a permission group lacks, though team has it
			permits: { v: ['o->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		record: {
			related: { t: ['team', 'staff'] },
			// @ts-expect-error 33. an arrow through a relation that also holds users
			permits: { v: ['t->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		record: {
			related: { t: ['team'] },
			// @ts-expect-error 34. when() names an arrow to what team lacks
			permits: { v: [when('t->nope', () => true)] },
		},
	},
});

defineModel({
	subjects,
	types: {
		// @ts-expect-error 35. "leads" names a relation and a permission, even with no rule
		team: { related: { leads: ['staff'] }, permits: { leads: [] } },
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { m: ['staff'] },
			// @ts-expect-error 37. a permission naming itself adds nothing, and never ends
			permits: { view: ['m', 'view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { m: ['staff'] },
			// @ts-expect-error 38. "permission", singular: a key no object type has
			permission: { view: ['m'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { m: ['staff'] }, permits: { view: ['m'] } },
		doc: {
			related: { teams: ['team', 'team#m'] },
			// @ts-expect-error 39. no arrow through a relation that can hold a subject set: an arrow follows object types only
			permits: { view: ['teams->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			// @ts-expect-error 40. relations, the key before 0.2: it is now related
			relations: { m: ['staff'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { m: ['staff'] },
			// @ts-expect-error 41. permissions, the key before 0.2: it is now permits
			permissions: { view: ['m'] },
		},
	},
});

const misspelled = {
	subjects,
	types: { team: { related: { m: ['staf'] } } },
} as const;
// @ts-expect-error 36. a model declared first is checked as one written inline
defineModel(misspelled);
