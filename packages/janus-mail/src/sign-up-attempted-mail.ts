/**
 * `signUpAttempted`: the e-mail to the owner of an address someone tried to
 * sign up with, which already has an account — which device, when, when the
 * sender knows — linking to where the owner signs in or resets the password.
 *
 * Apart from the other notices because of its optional `device` and `time`:
 * the sender may know neither, and the e-mail then says "Unknown" in the
 * send's locale, as `newSignIn` does for its location (`./no-location`).
 */

import { noLocationText } from './no-location';
import type { ResolvedOptions } from './options';
import { field, link, localeFor, send } from './send';
import type { JanusMail } from './types';

const METHOD = 'signUpAttempted';

/** The sender's text, the text of a missing one in `locale` without one, or a `TypeError`. */
function textOf(
	attempt: unknown,
	key: 'device' | 'time',
	locale: string,
): string {
	const given =
		typeof attempt === 'object' && attempt !== null
			? (attempt as Record<string, unknown>)[key]
			: undefined;
	if (given === undefined) return noLocationText(locale);
	return field(METHOD, attempt, key);
}

/** The sign-up attempt e-mail, over the resolved options. */
export function signUpAttemptedMail(
	options: ResolvedOptions,
): Pick<JanusMail<string>, 'signUpAttempted'> {
	const { brand, links } = options;
	return {
		// Async, so a wrong argument rejects as the other methods' do.
		async signUpAttempted(to, attempt) {
			const locale = localeFor(options, to);
			return send(options, METHOD, field(METHOD, to, 'email'), {
				brand,
				name: field(METHOD, to, 'name'),
				device: textOf(attempt, 'device', locale),
				time: textOf(attempt, 'time', locale),
				link: link(METHOD, links.getStarted(), 'getStarted()'),
				locale,
			});
		},
	};
}
