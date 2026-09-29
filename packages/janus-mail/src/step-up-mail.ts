/**
 * `stepUp`: the code of a step-up — a signed-in user proving again who they
 * are before a sensitive action — to the address `auth.stepUp.request(user)`
 * answered, greeting them, saying how long the code lasts, and linking to
 * where the account is secured, for a user who asked for nothing.
 *
 * Apart from the sign-in code's e-mail because of `via`: a step-up confirmed
 * with the user's app sends nothing, and is refused here rather than mailed
 * as an empty code.
 */
import { expiresInFor } from './expiry';
import type { ResolvedOptions } from './options';
import { field, link, localeFor, send } from './send';
import type { JanusMail } from './types';

const METHOD = 'stepUp';

/** `issued.via`, which must be `'email'`: a `TypeError` otherwise, before anything else is read. */
function checkVia(issued: unknown): void {
	const via =
		typeof issued === 'object' && issued !== null
			? (issued as { via?: unknown }).via
			: undefined;
	if (via !== 'email') {
		throw new TypeError(
			`janusMail.${METHOD}: via must be 'email' — a step-up confirmed with the user's app sends no e-mail`,
		);
	}
}

/** The step-up's e-mail, over the resolved options. */
export function stepUpMail(
	options: ResolvedOptions,
): Pick<JanusMail<string>, 'stepUp'> {
	const { brand, links } = options;
	return {
		// `via`, `code`, `email` and `expiresAt` only: the challenge is the user's secret.
		async stepUp(issued, to, sendOptions) {
			checkVia(issued);
			const locale = localeFor(options, to);
			return send(options, METHOD, field(METHOD, issued, 'email'), {
				brand,
				name: field(METHOD, to, 'name'),
				code: field(METHOD, issued, 'code'),
				expiresIn: expiresInFor(
					METHOD,
					issued,
					locale,
					sendOptions,
					options.clock,
				),
				link: link(METHOD, links.secureAccount(), 'secureAccount()'),
				locale,
			});
		},
	};
}
