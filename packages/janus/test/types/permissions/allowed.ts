/** What must keep compiling: a refusal that also refuses these is a bug. See `fixtures.ts`. */

import { access, can, record, staff, ward } from './fixtures';

// ─── What is allowed ──────────────────────────────────────────────────────

async function allowed() {
	return [
		// No condition on team.view: no ctx.
		await can(staff, 'view', { type: 'team', id: 't' }),
		// Anonymous is a question, answered false.
		await can(null, 'manage', { type: 'team', id: 't' }),
		await can(staff, 'edit', record, { ctx: { onShift: false } }),
		// A relation can be asked directly, and a fromField holding nobody is null.
		await can(staff, 'doctors', record),
		// An object can be a subject: a team, member of another team.
		await can({ type: 'team', id: 't' }, 'members', { type: 'team', id: 't2' }),
		// A user is a subject as it is; a subject set is granted by its relation.
		await access.grant({ type: 'team', id: 't' }, 'members', staff),
		await access.grant(record, 'viewers', {
			type: 'team',
			id: 't',
			relation: 'members',
		}),
		await access.can(staff, 'view', record, { ctx: { onShift: true } }),
		// Stored relations and arrows need nothing more to be listed.
		await access.list(staff, 'view', 'team', { limit: 10 }),
		await access.list(staff, 'teams', 'record', { after: null }),
		// A fromField with a lookup can be listed; its condition still needs ctx.
		await ward.list(staff, 'nurses', 'bed'),
		await ward.list(staff, 'use', 'bed', { ctx: { onShift: true }, limit: 5 }),
	];
}

export const checked = { allowed };
