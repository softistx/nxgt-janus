/**
 * Finding a user by their key or creating them — `findOrCreate`: asked of a
 * type with no login and no e-mail, an input that is not the type's fields, a
 * password that is no string, and the key handed over as the user. Cases
 * 85–88 of the one hundred and seven — see `fixtures.ts`. The shapes that must keep
 * compiling are at the end of this file.
 */

import { z } from 'zod';
import {
	createMemoryStores,
	type FindOrCreateApi,
	janus,
} from '../../../src/index';
import { clinic, hasher, one, twoFactor } from './fixtures';

/** A type with neither a login nor an e-mail: nothing to be found by. */
const ledger = janus({
	user: z.object({ service: z.string() }),
	store: createMemoryStores(),
	hasher,
});

async function findOrCreate(key: string) {
	// ── 85. Asked of a type with no login and no e-mail ───────────────────
	// @ts-expect-error nothing names this user: the lookup is absent
	await ledger.findOrCreate(key, () => ({ service: 'billing' }));

	// ── 86. An input that is not the type's fields ────────────────────────
	// @ts-expect-error a patient has a birthDate, not a name
	await clinic.patient.findOrCreate(key, () => ({ email: key, name: 'Ada' }));

	// ── 87. A password that is no string ──────────────────────────────────
	await one.findOrCreate(key, () => ({
		email: key,
		name: 'Ada',
		// @ts-expect-error the password, a string
		password: 12,
	}));

	// ── 88. The user handed over instead of the key ───────────────────────
	const user = await one.get('id');
	// @ts-expect-error the key, a string — never the user
	await one.findOrCreate(user, () => ({ email: key, name: 'Ada' }));
}

// ── Allowed: every type with a login or an e-mail has it ────────────────
async function allowed(key: string) {
	const accepted = await clinic.guest.findOrCreate(key, async () => ({
		email: key,
	}));
	const created: boolean = accepted.created;
	const type: 'guest' = accepted.user.type;
	const patient = await clinic.patient.findOrCreate(key, () => ({
		email: key,
		birthDate: '1815-12-10',
		password: 'correct horse',
		active: true,
	}));
	const staff = await clinic.staff.findOrCreate(key, () => ({
		username: key,
		service: 'billing',
		badge: 7,
	}));
	const birthDate: string = patient.user.birthDate;
	const guest = await twoFactor.guest.findOrCreate(key, () => ({ email: key }));
	const api: FindOrCreateApi<
		{ readonly id: string },
		{ readonly email: string }
	> = clinic.guest;
	return [created, type, birthDate, staff.user.badge, guest.created, api];
}

export const checked = { findOrCreate, allowed };
