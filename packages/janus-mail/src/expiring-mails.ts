/**
 * The three e-mails that carry what a flow issued — a one-time link or a
 * sign-in code — and say how long it lasts: `verifyEmail`, `resetPassword`
 * and `signInCode`.
 */
import { expiresInFor } from './expiry';
import type { ResolvedOptions } from './options';
import { field, link, localeFor, send } from './send';
import type { JanusMail } from './types';

type ExpiringMails = Pick<
	JanusMail<string>,
	'verifyEmail' | 'resetPassword' | 'signInCode'
>;

/** The two e-mails of a one-time token, which link to your page with it. */
type LinkMailName = 'verifyEmail' | 'resetPassword';

/** One e-mail of a one-time token: to `issued.email`, its link built from `issued.token`. */
function linkMail(options: ResolvedOptions, name: LinkMailName) {
	return async (issued: unknown, to: unknown, sendOptions?: unknown) => {
		const token = field(name, issued, 'token');
		const locale = localeFor(options, to);
		return send(options, name, field(name, issued, 'email'), {
			brand: options.brand,
			name: field(name, to, 'name'),
			link: link(name, options.links[name](token), `${name}(token)`),
			expiresIn: expiresInFor(name, issued, locale, sendOptions, options.clock),
			locale,
		});
	};
}

/** `verifyEmail`, `resetPassword` and `signInCode`, over the resolved options. */
export function expiringMails(options: ResolvedOptions): ExpiringMails {
	return {
		verifyEmail: linkMail(options, 'verifyEmail'),
		resetPassword: linkMail(options, 'resetPassword'),
		async signInCode(issued, to, sendOptions) {
			// `code`, `email` and `expiresAt` only: the challenge is the visitor's secret.
			const locale = localeFor(options, to);
			return send(options, 'signInCode', field('signInCode', issued, 'email'), {
				brand: options.brand,
				code: field('signInCode', issued, 'code'),
				expiresIn: expiresInFor(
					'signInCode',
					issued,
					locale,
					sendOptions,
					options.clock,
				),
				locale,
			});
		},
	};
}
