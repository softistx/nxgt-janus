/**
 * The refusals of the new sign-in notice, numbered after
 * `step-up-refusals.ts`'s: each `@ts-expect-error` is one plausible mistake
 * the compiler refuses, and the README counts them with the others. Below
 * them, the sends that must keep compiling.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import type { SignedIn, UserEvent } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { janusMail } from '../../src/index';

declare const event: UserEvent;
declare const signedIn: SignedIn<{
	readonly name: string;
	readonly email: string;
}>;
/** What a geo-IP lookup answers: `null` when it found nothing. */
declare const located: string | null;

const mail = janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		verifyEmail: (token: string) =>
			`https://acme.example/verify?token=${token}`,
		resetPassword: (token: string) =>
			`https://acme.example/reset?token=${token}`,
		secureAccount: () => 'https://acme.example/account/security',
		getStarted: () => 'https://acme.example/start',
	},
});

const ada = { name: 'Ada', email: 'ada@example.com', locale: 'fr' };
const time = '29 septembre 2026 à 09:12';

// ── The refusals ────────────────────────────────────────────────────────────

// 47. The user.newDeviceSignedIn event itself: it names the user by id, with neither a name nor an address.
// @ts-expect-error
await mail.newSignIn(event, { device: 'Firefox on macOS', time });

// 48. Without the device and the time: the e-mail says both.
// @ts-expect-error
await mail.newSignIn(ada);

// 49. time as the session's Date, not the text in the recipient's locale and time zone.
await mail.newSignIn(ada, {
	device: 'Firefox on macOS',
	// @ts-expect-error
	time: signedIn.session.createdAt,
});

// 50. A location lookup that found nothing, passed as null: leave location out.
await mail.newSignIn(ada, {
	device: 'Firefox on macOS',
	time,
	// @ts-expect-error
	location: located,
});

// ── What must keep compiling ────────────────────────────────────────────────

if (signedIn.newDevice) {
	await mail.newSignIn(
		{ name: signedIn.user.name, email: signedIn.user.email, locale: 'fr' },
		{ device: 'Firefox on macOS', time },
	);
}
await mail.newSignIn(ada, {
	device: 'Firefox on macOS',
	time,
	...(located === null ? {} : { location: located }),
});
