/**
 * The refusals of the e-mail change link's e-mail, numbered after
 * `new-sign-in-refusals.ts`'s: each `@ts-expect-error` is one plausible
 * mistake the compiler refuses, and the README counts them with the others.
 * Below them, the sends that must keep compiling — `links` without
 * `changeEmail` among them, since it is optional.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import type { IssuedCode, IssuedToken, StepUpByEmail } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { janusMail } from '../../src/index';

type User = { id: string; name: string };
declare const issuedCode: IssuedCode<{ id: string }>;
declare const stepUp: StepUpByEmail<User>;
declare const issued: IssuedToken;
declare const maybeIssued: IssuedToken | null;

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
	links: {
		...links,
		changeEmail: (token) => `https://acme.example/email/confirm?token=${token}`,
	},
});

// ── The refusals ────────────────────────────────────────────────────────────

// 51. A sign-in code given to changeEmail: it has no token, and its challenge must never be mailed.
// @ts-expect-error
await mail.changeEmail(issuedCode, { name: 'Ada' });

// 52. A step-up's code given to changeEmail: it has a code to type, no link to follow.
// @ts-expect-error
await mail.changeEmail(stepUp, { name: 'Ada' });

// 53. The token alone, not what changeEmail.send answered: the new address and the expiry are in it.
// @ts-expect-error
await mail.changeEmail('tok-change-321', { name: 'Ada' });

// 54. changeEmail.send's answer, not checked for null.
// @ts-expect-error
await mail.changeEmail(maybeIssued, { name: 'Ada' });

// 55. changeEmail without the recipient: its e-mail greets the user by name.
// @ts-expect-error
await mail.changeEmail(issued);

// 56. A recipient without a name.
// @ts-expect-error
await mail.changeEmail(issued, { locale: 'fr-CA' });

// 57. An e-mail change link's page computed asynchronously: the e-mail needs the string now.
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		...links,
		// @ts-expect-error
		changeEmail: async (token: string) => `https://acme.example/c?t=${token}`,
	},
});

// 58. An e-mail change link answered as a URL object rather than its href.
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		...links,
		// @ts-expect-error
		changeEmail: (token: string) =>
			new URL(`https://acme.example/c?t=${token}`),
	},
});

// ── What must keep compiling ────────────────────────────────────────────────

await mail.changeEmail(issued, { name: 'Ada', locale: ['fr-CA', 'en'] });
await mail.changeEmail(issued, { name: 'Ada' }, { expiresIn: '15 minutes' });
// An application that lets no user change their address leaves the link out.
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
});
