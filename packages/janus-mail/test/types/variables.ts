/**
 * `JanusMailVariables` held equal to the build. `MailEmails` is what
 * `@nxgt/mail-i18n` wrote from the manifest (`src/generated/mail.ts`): an
 * e-mail of the build, or a variable of one, that appears or goes — a new
 * `@nxgt/mail-presets`, a template changed in `mail/` — fails this file, and
 * the public type is changed on purpose rather than drifting.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */

import type { MailEmails } from '../../src/generated/mail';
import type { JanusMailVariables } from '../../src/index';

/** The e-mail each template sends, by the name of its built file. */
interface EmailOf {
	readonly verifyEmail: 'verify-email';
	readonly resetPassword: 'reset-password';
	readonly signInCode: 'sign-in-code';
	readonly magicLink: 'magic-link';
	readonly stepUp: 'confirm-action';
	readonly passwordChanged: 'password-changed';
	readonly emailChanged: 'email-changed';
	readonly twoFactorEnabled: 'two-factor-enabled';
	readonly twoFactorDisabled: 'two-factor-disabled';
	readonly recoveryCodeUsed: 'recovery-code-used';
	readonly welcome: 'welcome';
}

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;

/** Each template's variables, keyed by its e-mail: what the build must hold. */
type Promised = {
	readonly [K in keyof JanusMailVariables as EmailOf[K]]: keyof JanusMailVariables[K];
};
type Built = { readonly [E in keyof MailEmails]: keyof MailEmails[E] };

/** The same eleven e-mails, each with the same variables. */
export const sameVariables: Equal<Promised, Built> = true;

/** Every variable a template is given is one the build's renderer accepts. */
export const accepted: {
	readonly [K in keyof JanusMailVariables]: JanusMailVariables[K] extends MailEmails[EmailOf[K]]
		? true
		: false;
} = {
	verifyEmail: true,
	resetPassword: true,
	signInCode: true,
	magicLink: true,
	stepUp: true,
	passwordChanged: true,
	emailChanged: true,
	twoFactorEnabled: true,
	twoFactorDisabled: true,
	recoveryCodeUsed: true,
	welcome: true,
};
