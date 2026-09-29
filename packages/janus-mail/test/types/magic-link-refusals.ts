/**
 * The refusals of the sign-in link's e-mail, numbered after
 * `change-refusals.ts`'s: each `@ts-expect-error` is one plausible mistake
 * the compiler refuses, and the README counts them with the others. Below
 * them, the sends that must keep compiling — `links` without `magicLink`
 * among them, since it is optional.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import type { IssuedCode, IssuedToken } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { janusMail } from '../../src/index';

declare const issuedCode: IssuedCode<{ id: string }>;
declare const maybeLink: (IssuedToken & { user: { id: string } }) | null;

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
		magicLink: (token) => `https://acme.example/sign-in/link?token=${token}`,
	},
});

// ── The refusals ────────────────────────────────────────────────────────────

// 37. A sign-in code given to magicLink: it has no token, and its challenge must never be mailed.
// @ts-expect-error
await mail.magicLink(issuedCode);

// 38. magicLink.request's answer, not checked for null.
// @ts-expect-error
await mail.magicLink(maybeLink);

// 39. The token alone, not what the flow answered: the address and the expiry are in it.
// @ts-expect-error
await mail.magicLink('tok-link-789');

// 40. A sign-in link's page computed asynchronously: the e-mail needs the string now.
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links: {
		...links,
		// @ts-expect-error
		magicLink: async (token: string) => `https://acme.example/l?t=${token}`,
	},
});

// ── What must keep compiling ────────────────────────────────────────────────

if (maybeLink !== null) {
	await mail.magicLink(maybeLink);
	await mail.magicLink(maybeLink, { locale: ['fr-CA', 'en'] });
	await mail.magicLink(maybeLink, undefined, { expiresIn: '15 minutes' });
}
// An application that sends no sign-in link leaves the link out.
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	links,
});
