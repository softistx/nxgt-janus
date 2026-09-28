/**
 * `recoveryCodeUsed`: the notice of a recovery code spent — a sign-in
 * without the user's phone — saying when, and how many codes are left.
 *
 * Apart from the other notices because of its count: the build could not
 * choose the plural, so the send does, in the recipient's locale
 * (`./codes-left`).
 */
import { codesLeftText } from './codes-left';
import type { ResolvedOptions } from './options';
import { field, link, localeFor, send } from './send';
import type { JanusMail } from './types';

const METHOD = 'recoveryCodeUsed';

/** A count of codes: a whole number, 0 or more. */
const isCount = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * The sentence of the codes left: the count formatted in `locale`, or the
 * sender's own text. A `TypeError` for anything else, or for a count in a
 * locale the default e-mails hold no sentence for.
 */
function codesLeft(used: unknown, locale: string): string {
	const given =
		typeof used === 'object' && used !== null
			? (used as { recoveryCodesLeft?: unknown }).recoveryCodesLeft
			: undefined;
	if (typeof given === 'string') return given;
	if (!isCount(given)) {
		throw new TypeError(
			`janusMail.${METHOD}: recoveryCodesLeft must be a count — a whole number, 0 or more — or the sentence to show`,
		);
	}
	const text = codesLeftText(locale, given);
	if (text === undefined) {
		throw new TypeError(
			`janusMail.${METHOD}: recoveryCodesLeft must be the sentence to show in a locale the default e-mails are not built in`,
		);
	}
	return text;
}

/** The recovery code notice, over the resolved options. */
export function recoveryMail(
	options: ResolvedOptions,
): Pick<JanusMail<string>, 'recoveryCodeUsed'> {
	const { brand, links } = options;
	return {
		// Async, so a wrong argument rejects as the other methods' do.
		async recoveryCodeUsed(to, used) {
			const locale = localeFor(options, to);
			return send(options, METHOD, field(METHOD, to, 'email'), {
				brand,
				name: field(METHOD, to, 'name'),
				when: field(METHOD, used, 'when'),
				recoveryCodesLeft: codesLeft(used, locale),
				link:
					links.recoveryCodes === undefined
						? link(METHOD, links.secureAccount(), 'secureAccount()')
						: link(METHOD, links.recoveryCodes(), 'recoveryCodes()'),
				locale,
			});
		},
	};
}
