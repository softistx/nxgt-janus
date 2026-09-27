/**
 * The refusals of the expiry and the clock, numbered after
 * `option-refusals.ts`'s: each `@ts-expect-error` is one plausible mistake the
 * compiler refuses, and the README counts them with the others. Below them,
 * the calls that must keep compiling.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import { fixedClock, type IssuedCode, type IssuedToken } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { janusMail, type Recipient } from '../../src/index';

declare const issuedToken: IssuedToken;
declare const issuedCode: IssuedCode<{ id: string }>;

const mail = janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		verifyEmail: (token) => `https://acme.example/verify?token=${token}`,
		resetPassword: (token) => `https://acme.example/reset?token=${token}`,
		secureAccount: () => 'https://acme.example/account/security',
	},
});
const ada: Recipient = { name: 'Ada', locale: 'fr-CA' };

// ── The refusals ────────────────────────────────────────────────────────────

// 21. A sign-in code without its expiry: the e-mail says how long it works.
// @ts-expect-error
await mail.signInCode({ code: issuedCode.code, email: issuedCode.email });

// 22. A flow's answer that went through JSON: expiresAt is a string by then.
const queued = { ...issuedToken, expiresAt: '2026-09-27T12:00:00Z' };
// @ts-expect-error
await mail.verifyEmail(queued, ada);

// 23. expiresIn given as a number of seconds rather than the text to show.
// @ts-expect-error
await mail.resetPassword(issuedToken, ada, { expiresIn: 3600 });

// 24. expiresIn given with the recipient rather than as the send's option.
// @ts-expect-error
await mail.verifyEmail(issuedToken, { ...ada, expiresIn: '1 heure' });

// 25. clock given as a function of the time rather than janus's Clock.
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		verifyEmail: (token) => token,
		resetPassword: (token) => token,
		secureAccount: () => 'https://acme.example/account/security',
	},
	// @ts-expect-error
	clock: () => new Date(),
});

// ── What must keep compiling ────────────────────────────────────────────────

// The clock given to janus(), a fixedClock in tests.
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		verifyEmail: (token) => token,
		resetPassword: (token) => token,
		secureAccount: () => 'https://acme.example/account/security',
	},
	clock: fixedClock(Date.UTC(2026, 0, 1)),
});

// The expiry derived from the flow's expiresAt.
await mail.verifyEmail(issuedToken, ada);
await mail.signInCode(issuedCode);
// The send's own expiresIn, over the one derived.
await mail.verifyEmail(issuedToken, ada, { expiresIn: '24 heures' });
await mail.signInCode(issuedCode, undefined, { expiresIn: '10 minutes' });
await mail.resetPassword(issuedToken, ada, {});
