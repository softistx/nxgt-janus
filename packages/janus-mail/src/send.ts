/**
 * What every method shares: reading an argument's fields, a link, the
 * recipient's locale, and the send itself. A wrong argument is a `TypeError`
 * naming the method and the field — never its value.
 */
import type { Address, Rendered, SentMail, WantedLocales } from '@nxgt/mail';
import { pickLocale } from '@nxgt/mail';
import type { ResolvedOptions } from './options';
import type { JanusMailTemplateName, JanusMailVariables } from './types';

/** A string field of an argument, or a `TypeError` naming the method and the field. */
export function field(method: string, value: unknown, key: string): string {
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
export function link(method: string, value: unknown, call: string): string {
	if (typeof value !== 'string') {
		throw new TypeError(
			`janusMail.${method}: links.${call} must answer a string`,
		);
	}
	return value;
}

/** The locale the recipient gets: the first they want that is sent in, else the fallback. */
export function localeFor(options: ResolvedOptions, to: unknown): string {
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
export async function send<K extends JanusMailTemplateName>(
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
