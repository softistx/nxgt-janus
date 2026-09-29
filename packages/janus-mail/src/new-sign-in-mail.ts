/**
 * `newSignIn`: the notice of a sign-in from a device the user had not signed
 * in from — which device, when, and where when the sender knows — linking to
 * where the account is secured.
 *
 * Apart from the other notices because of its optional `location`: Janus
 * sees no IP, so the sender may know none, and the e-mail then shows `—`,
 * which reads the same in every locale.
 */

import { noLocationText } from './no-location';
import type { ResolvedOptions } from './options';
import { field, link, localeFor, send } from './send';
import type { JanusMail } from './types';

const METHOD = 'newSignIn';

/**
 * The sender's location, the text of a missing one in `locale` without one,
 * or a `TypeError` for anything else.
 */
function locationOf(signIn: unknown, locale: string): string {
	const given =
		typeof signIn === 'object' && signIn !== null
			? (signIn as { location?: unknown }).location
			: undefined;
	if (given === undefined) return noLocationText(locale);
	return field(METHOD, signIn, 'location');
}

/** The new sign-in notice, over the resolved options. */
export function newSignInMail(
	options: ResolvedOptions,
): Pick<JanusMail<string>, 'newSignIn'> {
	const { brand, links } = options;
	return {
		// Async, so a wrong argument rejects as the other methods' do.
		async newSignIn(to, signIn) {
			const locale = localeFor(options, to);
			return send(options, METHOD, field(METHOD, to, 'email'), {
				brand,
				name: field(METHOD, to, 'name'),
				device: field(METHOD, signIn, 'device'),
				location: locationOf(signIn, locale),
				time: field(METHOD, signIn, 'time'),
				link: link(METHOD, links.secureAccount(), 'secureAccount()'),
				locale,
			});
		},
	};
}
