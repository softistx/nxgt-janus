/**
 * Type safety, measured: each `@ts-expect-error` below is one plausible
 * mistake in a send the compiler refuses, and fails the typecheck the moment
 * it stops being refused. The README counts them with those of
 * `option-refusals.ts` (9 to 20), `expiry-refusals.ts` (21 to 25) and
 * `notice-refusals.ts` (26 to 29). Below
 * them, the sends that must keep compiling: a refusal that also refuses the
 * right call is a bug.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import type { IssuedCode, IssuedToken } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { janusMail, type Recipient } from '../../src/index';

declare const issuedToken: IssuedToken;
declare const issuedCode: IssuedCode<{ id: string }>;
declare const maybeReset: (IssuedToken & { user: { id: string } }) | null;

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
const ada: Recipient = { name: 'Ada', locale: 'fr-CA' };

// ── The refusals ────────────────────────────────────────────────────────────

// 1. A sign-in code given to verifyEmail: it has no token.
// @ts-expect-error
await mail.verifyEmail(issuedCode, ada);

// 2. A one-time token given to signInCode: it has no code.
// @ts-expect-error
await mail.signInCode(issuedToken);

// 3. resetPassword.request's answer, not checked for null first.
// @ts-expect-error
await mail.resetPassword(maybeReset, ada);

// 4. verifyEmail without the recipient: the e-mail greets them by name.
// @ts-expect-error
await mail.verifyEmail(issuedToken);

// 5. A recipient without a name.
// @ts-expect-error
await mail.resetPassword(issuedToken, { locale: 'fr' });

// 6. passwordChanged without the address to tell.
// @ts-expect-error
await mail.passwordChanged({ name: 'Ada' });

// 7. emailChanged without the former address, which is where it goes.
// @ts-expect-error
await mail.emailChanged({ name: 'Ada', newEmail: 'ada@new.example' });

// 8. A locale that is not a locale.
// @ts-expect-error
await mail.signInCode(issuedCode, { locale: 33 });

// ── What must keep compiling ────────────────────────────────────────────────

// Every flow's answer, as the flows give it.
await mail.verifyEmail(issuedToken, ada);
if (maybeReset !== null) await mail.resetPassword(maybeReset, ada);
await mail.signInCode(issuedCode); // the whole IssuedCode: only code, email and expiresAt are read
await mail.signInCode(issuedCode, { locale: ['fr-CA', 'en'] });
await mail.signInCode(issuedCode, ada); // a recipient with a name: the name is not used
await mail.passwordChanged({
	name: 'Ada',
	email: 'ada@example.com',
	locale: null,
});
await mail.emailChanged({
	...ada,
	formerEmail: 'ada@example.com',
	newEmail: 'ada@new.example',
});
