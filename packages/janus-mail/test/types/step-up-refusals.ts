/**
 * The refusals of the step-up's e-mail, numbered after
 * `magic-link-refusals.ts`'s: each `@ts-expect-error` is one plausible
 * mistake the compiler refuses, and the README counts them with the others.
 * Below them, the sends that must keep compiling, and the names of the
 * templates, held to the eleven the package sends.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import type {
	IssuedCode,
	IssuedToken,
	StepUpByApp,
	StepUpByEmail,
} from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import {
	type JanusMailTemplateName,
	janusMail,
	type Recipient,
} from '../../src/index';

type User = { id: string; name: string };
/** What `stepUp.request` answers for a type that may have a second factor. */
declare const issued: StepUpByEmail<User> | StepUpByApp<User>;
declare const byApp: StepUpByApp<User>;
declare const issuedCode: IssuedCode<{ id: string }>;
declare const issuedToken: IssuedToken;

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

// 41. stepUp.request's answer not narrowed to via: 'email' — an app's step-up has nothing to send.
// @ts-expect-error
await mail.stepUp(issued, ada);

// 42. A step-up confirmed with the user's app, narrowed to it.
// @ts-expect-error
await mail.stepUp(byApp, ada);

// 43. A sign-in code given to stepUp: it signs in, it confirms no action.
// @ts-expect-error
await mail.stepUp(issuedCode, ada);

// 44. A one-time token given to stepUp: it has no code.
// @ts-expect-error
await mail.stepUp(issuedToken, ada);

// 45. stepUp without the recipient: the e-mail greets the user by name.
declare const narrowed: StepUpByEmail<User>;
// @ts-expect-error
await mail.stepUp(narrowed);

// 46. The user the flow answered given as the recipient where it has no name.
declare const nameless: StepUpByEmail<{ id: string }>;
// @ts-expect-error
await mail.stepUp(nameless, nameless.user);

// ── What must keep compiling ────────────────────────────────────────────────

if (issued.via === 'email') {
	await mail.stepUp(issued, ada);
	await mail.stepUp(issued, issued.user); // a user with a name is a recipient
	await mail.stepUp(issued, { name: 'Ada', locale: ['fr-CA', 'en'] });
	await mail.stepUp(issued, ada, { expiresIn: '10 minutes' });
}
// A type with no second factor answers StepUpByEmail alone: no narrowing.
await mail.stepUp(narrowed, ada);

// ── The names of the templates ──────────────────────────────────────────────

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;

/** The eleven names, `stepUp` among them: one more or one fewer fails here. */
export const templateNames: Equal<
	JanusMailTemplateName,
	| 'verifyEmail'
	| 'resetPassword'
	| 'signInCode'
	| 'magicLink'
	| 'stepUp'
	| 'passwordChanged'
	| 'emailChanged'
	| 'twoFactorEnabled'
	| 'twoFactorDisabled'
	| 'recoveryCodeUsed'
	| 'welcome'
> = true;

/** Its template takes the step-up's variables, and a template for it compiles. */
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		verifyEmail: (token) => `https://acme.example/verify?token=${token}`,
		resetPassword: (token) => `https://acme.example/reset?token=${token}`,
		secureAccount: () => 'https://acme.example/account/security',
		getStarted: () => 'https://acme.example/start',
	},
	templates: {
		stepUp: ({ name, code, expiresIn, link }) => ({
			subject: `Your code: ${code}`,
			html: `<p>${name}, ${code} (${expiresIn}) — <a href="${link}">not you?</a></p>`,
			text: `${name}, ${code} (${expiresIn}) — not you? ${link}`,
		}),
	},
});
