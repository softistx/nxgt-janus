/**
 * `janusMail()`: the e-mails of Janus's flows, rendered by the templates and
 * handed to the mailer. It sends what a flow answered, to the address the
 * flow answered, and nothing else: no retry, no queue, no error of its own —
 * the mailer's `MailFailure` and `MailRefused` reach the caller untouched.
 */

import { expiringMails } from './expiring-mails';
import { noticeMails } from './notice-mails';
import { resolveOptions } from './options';
import { recoveryMail } from './recovery-mail';
import { stepUpMail } from './step-up-mail';
import type { JanusMail, JanusMailLocale, JanusMailOptions } from './types';

/**
 * The e-mails of Janus's flows, over your mailer:
 *
 * ```ts
 * const mail = janusMail({
 * 	mailer,
 * 	from: 'noreply@acme.example',
 * 	brand: 'Acme',
 * 	links: {
 * 		verifyEmail: (token) => `https://acme.example/verify?token=${token}`,
 * 		resetPassword: (token) => `https://acme.example/reset?token=${token}`,
 * 		secureAccount: () => 'https://acme.example/account/security',
 * 		getStarted: () => 'https://acme.example/',
 * 		recoveryCodes: () => 'https://acme.example/account/recovery-codes', // optional
 * 	},
 * });
 *
 * await mail.verifyEmail(await auth.verifyEmail.send(user), { name: user.name, locale: user.locale });
 * ```
 *
 * Reads nothing when called: the default e-mails are read on the first one
 * sent. A wrong option is a bare `TypeError`, thrown here.
 */
export function janusMail<const L extends string = JanusMailLocale>(
	options: JanusMailOptions<L>,
): JanusMail<L> {
	const resolved = resolveOptions(options);
	const mail: JanusMail<string> = Object.freeze({
		...expiringMails(resolved),
		...noticeMails(resolved),
		...recoveryMail(resolved),
		...stepUpMail(resolved),
		templates: resolved.templates,
		locales: resolved.locales,
	});
	// The one cast at the boundary: the mirror above works on `string` locales.
	return mail as unknown as JanusMail<L>;
}
