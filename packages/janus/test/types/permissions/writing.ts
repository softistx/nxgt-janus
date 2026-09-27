/** Cases 17–20: a tuple no relation can hold. See `fixtures.ts`. */

import { defineModel, fromField } from '../../../src/permissions/index';
import { access, record, staff, subjects } from './fixtures';

// ─── Writing tuples ───────────────────────────────────────────────────────

// @ts-expect-error 17. doctors is read from doctorId: there is no tuple to write
access.grant(record, 'doctors', staff);

// @ts-expect-error 18. team.leads is held by staff, not by patients
access.grant({ type: 'team', id: 't' }, 'leads', { type: 'patient', id: 'p' });

access.grant(record, 'viewers', {
	type: 'team',
	id: 't',
	// @ts-expect-error 19. record.viewers admits team#members, not team#leads
	relation: 'leads',
});

defineModel({
	subjects,
	types: {
		team: { related: { leads: fromField('leadId', 'staff') } },
		// @ts-expect-error 20. a subject set on a relation read from a field: no data to read it from
		record: { related: { viewers: ['team#leads'] } },
	},
});
