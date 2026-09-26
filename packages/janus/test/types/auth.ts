/**
 * What `janus()` refuses at COMPILE time, seen from the application wiring it.
 *
 * Checked by `tsc --noEmit`, never run — see `refusals.ts` for why a
 * `@ts-expect-error` is the unit of measurement. Each of these is a mistake an
 * application is likely to make, and each would otherwise surface at run time:
 * a user who can never sign in, a field read off the wrong kind of user, a
 * password hash handed to a request handler.
 *
 * **Twenty-five plausible mistakes, twenty-five refused.** Add a case whenever the
 * surface gains something it should refuse; never delete one to make a change
 * pass.
 */

import { z } from 'zod';
import {
	createMemoryStores,
	janus,
	scryptHasher,
	type User,
} from '../../src/index';

const store = createMemoryStores();
const hasher = scryptHasher();
const request = new Headers();

const Patient = z.object({
	email: z.email(),
	birthDate: z.string(),
	nickname: z.string().optional(),
});
const Staff = z.object({
	username: z.string(),
	service: z.string(),
	badge: z.number(),
});

const one = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store,
	hasher,
});

const clinic = janus({
	users: {
		patient: { schema: Patient, password: { login: 'email' } },
		staff: { schema: Staff, password: { login: 'username' } },
		guest: { schema: z.object({ email: z.email() }) },
	},
	store,
	hasher,
});

const twoFactor = janus({
	users: {
		patient: { schema: Patient, password: { login: 'email' } },
		guest: { schema: z.object({ email: z.email() }) },
	},
	store,
	hasher,
	secondFactor: { issuer: 'Clinic', keys: [{ id: 'k1', key: 'a'.repeat(43) }] },
});

// ── Wiring ───────────────────────────────────────────────────────────────────

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

// ── Signing up and in ───────────────────────────────────────────────────────

async function flows() {
	// ── 10. Signing in with another type's login field ──────────────────────
	// @ts-expect-error staff sign in with a username
	await clinic.staff.signIn({ email: 'a@b.test', password: 'x' });

	// ── 11. Signing in without a password ─────────────────────────────────
	// @ts-expect-error password is required
	await one.signIn({ email: 'a@b.test' });

	// ── 12. Signing up without a password ─────────────────────────────────
	// `create` is the call for a user with none; `signUp` signs in.
	// @ts-expect-error password is required
	await one.signUp({ email: 'a@b.test', name: 'Ada' });

	// ── 13. Signing up without a required field ───────────────────────────
	// @ts-expect-error birthDate is required
	await clinic.patient.signUp({ email: 'a@b.test', password: 'secret123' });

	// ── 14. A flow the type does not have ─────────────────────────────────
	// Staff have no e-mail: there is nowhere to send a reset link.
	// @ts-expect-error staff have no resetPassword
	await clinic.staff.resetPassword.request('a@b.test');

	// ── 15. Signing in to a type with no password ─────────────────────────
	// @ts-expect-error guests do not sign in with a password
	await clinic.guest.signIn({ email: 'a@b.test', password: 'x' });

	// ── Reading users ─────────────────────────────────────────────────────

	const current = await clinic.authenticate(request);
	if (current !== null) {
		// ── 16. Reading one type's field without narrowing ────────────────
		// @ts-expect-error a patient has no service
		current.user.service;

		// ── 17. Reading the password hash ─────────────────────────────────
		// No type that reaches a handler carries it.
		// @ts-expect-error there is no password on a user, only hasPassword
		current.user.password;
	}

	// ── 18. Authenticating as a type that does not exist ──────────────────
	// @ts-expect-error there is no admin type
	await clinic.authenticate(request, { type: 'admin' });

	// ── 19. Changing a field to the wrong type ────────────────────────────
	const { user } = await clinic.staff.signIn({
		username: 'grace',
		password: 'x',
	});
	// @ts-expect-error badge is a number
	await clinic.staff.update(user, { badge: '42' });

	// ── 20. Writing to a user object ──────────────────────────────────────
	// A mutation would not reach the store: `update` is the only write.
	// @ts-expect-error a user is readonly
	user.service = 'surgery';

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
}

// ── And the shapes that MUST keep compiling ─────────────────────────────────

async function allowed() {
	const { user, token, session } = await one.signUp({
		email: 'a@b.test',
		name: 'Ada',
		password: 'secret123',
	});
	const name: string = user.name;
	const type: 'user' = user.type;
	const verified: boolean = user.emailVerified;

	await one.verifyEmail.send(user);
	await one.resetPassword.request('a@b.test');
	await one.update(user, { name: 'Ada L.' }, { ifVersion: user.version });

	// Narrowing by `type` reaches the type's own fields.
	const current = await clinic.authenticate(request);
	if (current?.user.type === 'staff') {
		const service: string = current.user.service;
		void service;
	}
	const staff = await clinic.authenticate(request, { type: 'staff' });
	const badge: number | undefined = staff?.user.badge;

	// A patient may reset a password; a guest may still verify an e-mail.
	await clinic.patient.resetPassword.request('a@b.test');
	await clinic.guest.verifyEmail.send('0190e3b4-0000-7000-8000-000000000000');

	// A created user needs no password, and no session is opened.
	const guest: User<'guest', { email: string }> = await clinic.guest.create({
		email: 'g@b.test',
	});

	// With a second factor, `status` says which answer `signIn` gave.
	const result = await twoFactor.patient.signIn({
		email: 'a@b.test',
		password: 'secret123',
	});
	const signedIn =
		result.status === 'signedIn'
			? result
			: await twoFactor.patient.secondFactor.confirm(
					result.challenge,
					'123456',
				);
	const patientToken: string = signedIn.token;
	const enrolment: { secret: string; uri: string } =
		await twoFactor.patient.secondFactor.enroll(signedIn.user);
	const active: boolean = signedIn.user.hasSecondFactor;

	return [
		name,
		type,
		verified,
		token,
		session,
		badge,
		guest,
		one.cookie.name,
		patientToken,
		enrolment,
		active,
	];
}

export const checked = { flows, allowed };
