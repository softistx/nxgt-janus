/**
 * Wiring `janus()`: logins, schemas and configurations it refuses. Cases 1–9 of
 * the thirty-four — see `fixtures.ts`.
 */

import { z } from 'zod';
import { janus } from '../../../src/index';
import { hasher, Patient, Staff, store } from './fixtures';

// ── 1. A login that names no field ──────────────────────────────────────────
// The refusal lands on `login`, and the message lists the fields it could be.
janus({
	user: Patient,
	// @ts-expect-error "emial" is not a field of the schema
	password: { login: 'emial' },
	store,
	hasher,
});

// ── 2. A login that names a field that is not a string ─────────────────────
janus({
	users: {
		// @ts-expect-error badge is a number
		staff: { schema: Staff, password: { login: 'badge' } },
	},
	store,
	hasher,
});

// ── 3. A login read from an optional field ──────────────────────────────────
// A user with no nickname would have no way to sign in.
janus({
	user: Patient,
	// @ts-expect-error nickname is optional
	password: { login: 'nickname' },
	store,
	hasher,
});

// ── 4. An e-mail that names no field ───────────────────────────────────────
janus({
	user: Staff,
	// @ts-expect-error "mail" is not a field of the schema
	email: 'mail',
	store,
});

// ── 5. A schema that declares a field janus sets ───────────────────────────
// `user.id` would be the application's id or janus's, depending on the order
// of a spread.
janus({
	// @ts-expect-error id is set by janus
	user: z.object({ id: z.string(), email: z.email() }),
	store,
});

// ── 6. A schema with a password among its fields ───────────────────────────
// The password is taken beside the fields, and never stored among them: one
// declared in the schema would be stored in clear.
janus({
	// @ts-expect-error password is not a field
	user: z.object({ email: z.email(), password: z.string() }),
	store,
});

// ── 7. A user type named like a method of the answer ───────────────────────
janus({
	users: {
		// @ts-expect-error auth.authenticate would be either
		authenticate: { schema: Patient },
	},
	store,
});

// ── 8. A schema whose output is not JSON ───────────────────────────────────
// A Date round-trips through MongoDB and not through a JSON column.
janus({
	// @ts-expect-error a Date is not JSON
	user: z.object({ email: z.email(), born: z.date() }),
	store,
});

// ── 9. Both forms at once ──────────────────────────────────────────────────
// @ts-expect-error user or users, never both
janus({ user: Patient, users: { staff: { schema: Staff } }, store });
