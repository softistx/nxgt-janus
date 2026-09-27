/**
 * The second factor: a schema declaring its field, flows without keys, a
 * session read before narrowing, a factor on a type with no password, a
 * confirmation without its code. Cases
 * 21–28 of the thirty-four — see `fixtures.ts`; case 30, a code that may
 * still ask for the factor, is in `sign-in-codes.ts`.
 */

import { z } from 'zod';
import { janus } from '../../../src/index';
import { hasher, one, Patient, store, twoFactor } from './fixtures';

async function secondFactor() {
	// ── 21. A schema declaring what janus sets ────────────────────────────
	janus({
		// @ts-expect-error hasSecondFactor is janus's own field
		user: z.object({ email: z.email(), hasSecondFactor: z.boolean() }),
		password: { login: 'email' },
		store,
		hasher,
	});

	// ── 22. A second factor janus() was not given keys for ────────────────
	// @ts-expect-error no secondFactor in the configuration, so no flows
	await one.secondFactor.enroll('0190e3b4-0000-7000-8000-000000000000');

	// ── 23. A session read off a sign-in that may have asked for a code ───
	const result = await twoFactor.patient.signIn({
		email: 'a@b.test',
		password: 'p',
	});
	// @ts-expect-error narrow on status first: a challenge has no token
	void result.token;

	// ── 24. A second factor on a type with no password ────────────────────
	// @ts-expect-error guests do not sign in, so they have no second factor
	await twoFactor.guest.secondFactor.enroll(
		'0190e3b4-0000-7000-8000-000000000000',
	);

	// ── 25. Confirming a challenge without the code ───────────────────────
	// @ts-expect-error the code is what the challenge waits for
	await twoFactor.patient.secondFactor.confirm('challenge');

	// ── 26. No key to seal with ───────────────────────────────────────────
	janus({
		user: Patient,
		password: { login: 'email' },
		store,
		hasher,
		// @ts-expect-error the first key seals: there must be one
		secondFactor: { issuer: 'Clinic', keys: [] },
	});

	// ── 27. Activating without the first code ─────────────────────────────
	// @ts-expect-error the code proves the app holds the secret
	await twoFactor.patient.secondFactor.activate(
		'0190e3b4-0000-7000-8000-000000000000',
	);

	// ── 28. A second factor that may be on, read as if it were off ────────
	const maybe = janus({
		user: Patient,
		password: { login: 'email' },
		store,
		hasher,
		...(process.env.TOTP_KEY === undefined
			? {}
			: {
					secondFactor: {
						issuer: 'Clinic',
						keys: [{ id: 'k1', key: process.env.TOTP_KEY }] as const,
					},
				}),
	});
	const perhaps = await maybe.signIn({ email: 'a@b.test', password: 'p' });
	// @ts-expect-error it may be on at run time: narrow on status first
	void perhaps.token;
}

export const checked = { secondFactor };
