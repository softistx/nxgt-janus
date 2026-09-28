/**
 * The refusals of the e-mail change notice sent on `user.emailChanged`,
 * numbered after `recovery-refusals.ts`'s: each `@ts-expect-error` is one
 * plausible mistake the compiler refuses, and the README counts them with the
 * others. Below them, the send that must keep compiling.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import type { UserEvent } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { janusMail } from '../../src/index';

declare const event: UserEvent;
declare const user: { name: string; locale: string; email: string };

const mail = janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		verifyEmail: (token) => `https://acme.example/verify?token=${token}`,
		resetPassword: (token) => `https://acme.example/reset?token=${token}`,
		secureAccount: () => 'https://acme.example/account/security',
		getStarted: () => 'https://acme.example/start',
	},
});

// ── The refusals ────────────────────────────────────────────────────────────

if (event.type === 'user.emailChanged') {
	// 35. The former address sent to unchecked: null for a user who had none.
	await mail.emailChanged({
		name: user.name,
		// @ts-expect-error
		formerEmail: event.formerEmail,
		newEmail: user.email,
	});

	// 36. The user.emailChanged event itself: it has the former address, but neither a name nor the new one.
	// @ts-expect-error
	await mail.emailChanged(event);
}

// ── What must keep compiling ────────────────────────────────────────────────

if (event.type === 'user.emailChanged' && event.formerEmail != null) {
	await mail.emailChanged({
		name: user.name,
		locale: user.locale,
		formerEmail: event.formerEmail,
		newEmail: user.email,
	});
}
