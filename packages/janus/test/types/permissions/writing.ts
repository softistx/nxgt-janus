/** Cases 17–20 and 49–52: a tuple no relation can hold, to grant or to replace. See `fixtures.ts`. */

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

// @ts-expect-error 49. doctors is read from doctorId: replace has nothing to store
access.replace(record, 'doctors', [staff]);

access.replace({ type: 'team', id: 't' }, 'leads', [
	staff,
	// @ts-expect-error 50. team.leads is held by staff, and one patient in the list is refused
	{ type: 'patient', id: 'p' },
]);

access.replace({ type: 'team', id: 't' }, 'members', [
	staff,
	{
		type: 'team',
		id: 't2',
		// @ts-expect-error 51. team.members admits team#members, not team#leads
		relation: 'leads',
	},
]);

// @ts-expect-error 52. replace takes the wanted holders as an array, not one subject
access.replace({ type: 'team', id: 't' }, 'members', staff);

defineModel({
	subjects,
	types: {
		team: { related: { leads: fromField('leadId', 'staff') } },
		// @ts-expect-error 20. a subject set on a relation read from a field: no data to read it from
		record: { related: { viewers: ['team#leads'] } },
	},
});
