/**
 * What the specs share: the options of a `janusMail()` over a memory mailer,
 * and what each flow of `@nxgt/janus` answers, shaped as it answers it.
 */
import {
	fixedClock,
	type IssuedCode,
	type IssuedToken,
	type StepUpByEmail,
} from '@nxgt/janus';
import { createMemoryMailer, type MemoryMail } from '@nxgt/mail';
import type { JanusMailLinks } from '../src/types';

export const links: JanusMailLinks = {
	verifyEmail: (token) => `https://acme.example/verify?token=${token}`,
	resetPassword: (token) => `https://acme.example/reset?token=${token}`,
	secureAccount: () => 'https://acme.example/account/security',
	getStarted: () => 'https://acme.example/start',
	magicLink: (token) => `https://acme.example/sign-in/link?token=${token}`,
};

/** The options every spec starts from, with a fresh memory mailer. */
export function baseOptions() {
	return {
		mailer: createMemoryMailer(),
		from: 'noreply@acme.example',
		brand: 'Acme',
		links,
		clock: fixedClock(issuedAt),
	};
}

/** When every flow below answered: an hour before `expiresAt`, by `baseOptions()`'s clock. */
export const issuedAt = new Date('2026-09-27T11:00:00Z');

const expiresAt = new Date('2026-09-27T12:00:00Z');

/** What `auth.verifyEmail.send(user)` answers. */
export const verification: IssuedToken = {
	token: 'tok-verify-123',
	email: 'ada@example.com',
	expiresAt,
};

/** What `auth.resetPassword.request(email)` answers for a user who exists. */
export const reset: IssuedToken & { readonly user: { readonly id: string } } = {
	token: 'tok-reset-456',
	email: 'ada@example.com',
	expiresAt,
	user: { id: 'u1' },
};

/** What `auth.signInCode.request(email)` answers — challenge included, which must go nowhere. */
export const signIn: IssuedCode<{ readonly id: string }> = {
	code: '042817',
	challenge: 'CHALLENGE-must-never-be-mailed',
	email: 'ada@example.com',
	expiresAt,
	user: { id: 'u1' },
};

/** What `auth.magicLink.request(email)` answers for a user who exists. */
export const signInLink: IssuedToken & {
	readonly user: { readonly id: string };
} = {
	token: 'tok-link-789',
	email: 'ada@example.com',
	expiresAt,
	user: { id: 'u1' },
};

/** What `auth.stepUp.request(user)` answers for a user with no active second factor — challenge included. */
export const stepUp: StepUpByEmail<{ readonly id: string }> = {
	via: 'email',
	code: '315062',
	challenge: 'STEP-UP-CHALLENGE-must-never-be-mailed',
	email: 'ada@example.com',
	expiresAt,
	user: { id: 'u1' },
};

/** The error a send rejects with, settled where it is created — `null` when it resolved. */
export const rejection = (sending: Promise<unknown>): Promise<unknown> =>
	sending.then(
		() => null,
		(error: unknown) => error,
	);

/** Every part of a sent e-mail, to search in one go. */
export function partsOf(sent: MemoryMail | undefined): string[] {
	if (sent === undefined) throw new Error('nothing was sent');
	return [sent.subject, sent.html, sent.text];
}
