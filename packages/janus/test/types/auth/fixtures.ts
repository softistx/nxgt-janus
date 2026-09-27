/**
 * What `janus()` refuses at COMPILE time, seen from the application wiring it.
 *
 * Checked by `tsc --noEmit`, never run — see `../refusals.ts` for why a
 * `@ts-expect-error` is the unit of measurement. Each case in this folder is a
 * mistake an application is likely to make, and each would otherwise surface
 * at run time: a user who can never sign in, a field read off the wrong kind
 * of user, a password hash handed to a request handler.
 *
 * **Thirty-four plausible mistakes, thirty-four refused**, numbered across the
 * folder, one file per behaviour: `wiring.ts`, `sign-up-and-in.ts`,
 * `users.ts`, `second-factor.ts`, `sign-in-codes.ts` and `events.ts`, with
 * the shapes that must keep compiling in `allowed.ts` — the event
 * listener's beside its refusals, in `events.ts`. Add a case whenever
 * the surface gains something it should refuse; never delete one to make a
 * change pass.
 *
 * This file holds no case: only the instances the others are written against.
 */

import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '../../../src/index';

export const store = createMemoryStores();
export const hasher = scryptHasher();
export const request = new Headers();

export const Patient = z.object({
	email: z.email(),
	birthDate: z.string(),
	nickname: z.string().optional(),
});
export const Staff = z.object({
	username: z.string(),
	service: z.string(),
	badge: z.number(),
});

export const one = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store,
	hasher,
});

export const clinic = janus({
	users: {
		patient: { schema: Patient, password: { login: 'email' } },
		staff: { schema: Staff, password: { login: 'username' } },
		guest: { schema: z.object({ email: z.email() }) },
	},
	store,
	hasher,
});

export const twoFactor = janus({
	users: {
		patient: { schema: Patient, password: { login: 'email' } },
		guest: { schema: z.object({ email: z.email() }) },
	},
	store,
	hasher,
	secondFactor: { issuer: 'Clinic', keys: [{ id: 'k1', key: 'a'.repeat(43) }] },
});
