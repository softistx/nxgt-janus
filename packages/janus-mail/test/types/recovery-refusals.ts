/**
 * The refusals of the recovery code notice, numbered after
 * `notice-refusals.ts`'s: each `@ts-expect-error` is one plausible mistake
 * the compiler refuses, and the README counts them with the others. Below
 * them, the sends that must keep compiling.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import type { UserEvent } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { janusMail } from '../../src/index';

declare const event: UserEvent;
/** What `auth.secondFactor.recoveryCodesLeft(user)` answers: `null` without an active factor. */
declare const left: number | null;

const links = {
	verifyEmail: (token: string) => `https://acme.example/verify?token=${token}`,
	resetPassword: (token: string) => `https://acme.example/reset?token=${token}`,
	secureAccount: () => 'https://acme.example/account/security',
	getStarted: () => 'https://acme.example/start',
};

const mail = janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
});

const ada = { name: 'Ada', email: 'ada@example.com', locale: 'fr' };

// ── The refusals ────────────────────────────────────────────────────────────

// 30. The user.recoveryCodeUsed event itself: it names the user by id, with neither a name nor an address.
// @ts-expect-error
await mail.recoveryCodeUsed(event, { when: 'today', recoveryCodesLeft: 9 });

// 31. Without when and the count: the e-mail says both.
// @ts-expect-error
await mail.recoveryCodeUsed(ada);

// 32. The count as recoveryCodesLeft() answered it, not checked for null first.
await mail.recoveryCodeUsed(ada, {
	when: 'today',
	// @ts-expect-error
	recoveryCodesLeft: left,
});

// 33. when as the event's Date, not the text in the recipient's locale and time zone.
await mail.recoveryCodeUsed(ada, {
	// @ts-expect-error
	when: event.occurredAt,
	recoveryCodesLeft: 9,
});

// 34. links.recoveryCodes given as a URL rather than a function.
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		...links,
		// @ts-expect-error
		recoveryCodes: 'https://acme.example/account/recovery-codes',
	},
});

// ── What must keep compiling ────────────────────────────────────────────────

if (left !== null) {
	await mail.recoveryCodeUsed(ada, {
		when: event.occurredAt.toLocaleString('fr'),
		recoveryCodesLeft: left,
	});
}
await mail.recoveryCodeUsed(ada, {
	when: 'today',
	recoveryCodesLeft: 'Only a few codes are left.',
});
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		...links,
		recoveryCodes: () => 'https://acme.example/account/recovery-codes',
	},
});
