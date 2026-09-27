/**
 * `janusMail()`: the e-mails of Janus's flows, rendered by the templates and
 * handed to the mailer. It sends what a flow answered, to the address the
 * flow answered, and nothing else: no retry, no queue, no error of its own —
 * the mailer's `MailFailure` and `MailRefused` reach the caller untouched.
 */
import type { Address, Rendered, SentMail, WantedLocales } from '@nxgt/mail';
import { pickLocale } from '@nxgt/mail';
import { type ResolvedOptions, resolveOptions } from './options';
import type {
	JanusMail,
	JanusMailLocale,
	JanusMailOptions,
	JanusMailTemplateName,
	JanusMailVariables,
} from './types';

/** A string field of an argument, or a `TypeError` naming the method and the field. */
function field(method: string, value: unknown, key: string): string {
	const read =
		typeof value === 'object' && value !== null
			? (value as Record<string, unknown>)[key]
			: undefined;
	if (typeof read !== 'string') {
		throw new TypeError(`janusMail.${method}: ${key} must be a string`);
	}
	return read;
}

/**
 * What a `links` function answered, or a `TypeError` naming the method and
 * the call. Its scheme is the renderer's to check: `http(s)` and `mailto:`
 * pass, anything else is its `MailRefused`.
 */
function link(method: string, value: unknown, call: string): string {
	if (typeof value !== 'string') {
		throw new TypeError(
			`janusMail.${method}: links.${call} must answer a string`,
		);
	}
	return value;
}

/** The locale the recipient gets: the first they want that is sent in, else the fallback. */
function localeFor(options: ResolvedOptions, to: unknown): string {
	const wanted =
		typeof to === 'object' && to !== null
			? (to as { locale?: WantedLocales }).locale
			: undefined;
	return pickLocale(wanted, options.locales, options.fallbackLocale);
}

/**
 * Renders one e-mail and hands it to the mailer. Only `subject`, `html` and
 * `text` are read from what the template answered: a template cannot add a
 * recipient or a header.
 */
async function send<K extends JanusMailTemplateName>(
	options: ResolvedOptions,
	name: K,
	address: string,
	variables: JanusMailVariables[K] & { readonly locale: string },
): Promise<SentMail> {
	const template = options.templates[name] as (
		variables: JanusMailVariables[K] & { readonly locale: string },
	) => Rendered | PromiseLike<Rendered>;
	const { subject, html, text }: Rendered = await template(variables);
	const replyTo: { replyTo?: Address } =
		options.replyTo === undefined ? {} : { replyTo: options.replyTo };
	return options.mailer.send({
		to: address,
		from: options.from,
		...replyTo,
		subject,
		html,
		text,
	});
}

/** The five methods, over the resolved options. */
function methods(
	options: ResolvedOptions,
): Omit<JanusMail<string>, 'templates' | 'locales'> {
	const { brand, links } = options;
	return {
		async verifyEmail(issued, to) {
			const token = field('verifyEmail', issued, 'token');
			return send(
				options,
				'verifyEmail',
				field('verifyEmail', issued, 'email'),
				{
					brand,
					name: field('verifyEmail', to, 'name'),
					link: link(
						'verifyEmail',
						links.verifyEmail(token),
						'verifyEmail(token)',
					),
					locale: localeFor(options, to),
				},
			);
		},
		async resetPassword(issued, to) {
			const token = field('resetPassword', issued, 'token');
			return send(
				options,
				'resetPassword',
				field('resetPassword', issued, 'email'),
				{
					brand,
					name: field('resetPassword', to, 'name'),
					link: link(
						'resetPassword',
						links.resetPassword(token),
						'resetPassword(token)',
					),
					locale: localeFor(options, to),
				},
			);
		},
		async signInCode(issued, to) {
			// `code` and `email` only: the challenge is the visitor's secret.
			return send(options, 'signInCode', field('signInCode', issued, 'email'), {
				brand,
				code: field('signInCode', issued, 'code'),
				locale: localeFor(options, to),
			});
		},
		async passwordChanged(to) {
			return send(
				options,
				'passwordChanged',
				field('passwordChanged', to, 'email'),
				{
					brand,
					name: field('passwordChanged', to, 'name'),
					link: link(
						'passwordChanged',
						links.secureAccount(),
						'secureAccount()',
					),
					locale: localeFor(options, to),
				},
			);
		},
		async emailChanged(to) {
			// To the former address: the one a hijacker just took the account from.
			return send(
				options,
				'emailChanged',
				field('emailChanged', to, 'formerEmail'),
				{
					brand,
					name: field('emailChanged', to, 'name'),
					link: link('emailChanged', links.secureAccount(), 'secureAccount()'),
					newEmail: field('emailChanged', to, 'newEmail'),
					locale: localeFor(options, to),
				},
			);
		},
	};
}

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
		...methods(resolved),
		templates: resolved.templates,
		locales: resolved.locales,
	});
	// The one cast at the boundary: the mirror above works on `string` locales.
	return mail as unknown as JanusMail<L>;
}
