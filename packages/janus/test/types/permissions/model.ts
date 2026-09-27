/** Cases 1–8: a model that names what it does not declare. See `fixtures.ts`. */

import { defineModel, fromField, when } from '../../../src/permissions/index';
import { subjects } from './fixtures';

// ─── The model ────────────────────────────────────────────────────────────

defineModel({
	subjects,
	types: {
		// @ts-expect-error 1. "staf" is not a subject type
		team: { related: { members: ['staf'] } },
	},
});

defineModel({
	subjects,
	types: {
		// @ts-expect-error 2. a subject set naming a relation team does not have
		team: { related: { members: ['team#membre'] } },
	},
});

defineModel({
	subjects,
	types: {
		record: {
			// @ts-expect-error 3. fromField naming "doctr", not a subject type
			related: { doctors: fromField('doctorId', 'doctr') },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { leads: ['staff'] },
			// @ts-expect-error 4. a rule naming no relation or permission
			permits: { manage: ['leed'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { leads: ['staff'] },
			// @ts-expect-error 5. a condition on a rule naming nothing
			permits: { manage: [when('leed', () => true)] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: { related: { leads: ['staff'] } },
		record: {
			related: { teams: ['team'] },
			// @ts-expect-error 6. an arrow to "view", which team does not declare
			permits: { view: ['teams->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		record: {
			related: { doctors: ['staff'] },
			// @ts-expect-error 7. an arrow through a relation holding users, who have no permissions
			permits: { view: ['doctors->view'] },
		},
	},
});

defineModel({
	subjects,
	types: {
		team: {
			related: { leads: ['staff'] },
			// @ts-expect-error 8. "leads" names a relation and a permission
			permits: { leads: ['leads'] },
		},
	},
});
