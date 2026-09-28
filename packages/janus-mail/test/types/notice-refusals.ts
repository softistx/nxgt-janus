/**
 * The refusals of the two-factor notices and the welcome, numbered after
 * `expiry-refusals.ts`'s: each `@ts-expect-error` is one plausible mistake
 * the compiler refuses, and the README counts them with the others. Below
 * them, the sends that must keep compiling.
 *
 * Typechecked by `tsc --noEmit`, never run.
 */
import type { UserEvent } from '@nxgt/janus';
import { createMemoryMailer } from '@nxgt/mail';
import { janusMail } from '../../src/index';

declare const event: UserEvent;

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

// 26. The user event itself: it names the user by id, with neither a name nor an address.
// @ts-expect-error
await mail.twoFactorDisabled(event);

// 27. twoFactorEnabled given emailChanged's former address, not the address to tell.
// @ts-expect-error
await mail.twoFactorEnabled({ name: 'Ada', formerEmail: 'ada@example.com' });

// 28. The user.created event itself given to welcome: it has neither a name nor an address.
// @ts-expect-error
await mail.welcome(event);

// 29. links written before welcome, without getStarted, which it links to.
janusMail({
	mailer: createMemoryMailer(),
	from: 'noreply@acme.example',
	brand: 'Acme',
	// @ts-expect-error
	links: {
		verifyEmail: (token: string) =>
			`https://acme.example/verify?token=${token}`,
		resetPassword: (token: string) =>
			`https://acme.example/reset?token=${token}`,
		secureAccount: () => 'https://acme.example/account/security',
	},
});

// ── What must keep compiling ────────────────────────────────────────────────

await mail.twoFactorEnabled({ name: 'Ada', email: 'ada@example.com' });
await mail.twoFactorDisabled({
	name: 'Ada',
	email: 'ada@example.com',
	locale: ['fr-CA', 'en'],
});
await mail.welcome({ name: 'Ada', email: 'ada@example.com', locale: 'fr' });
