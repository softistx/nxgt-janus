/**
 * The notices of a change the user made — or someone else did:
 * `passwordChanged`, `emailChanged`, `twoFactorEnabled` and
 * `twoFactorDisabled`. Each links to where the account is secured.
 */
import type { ResolvedOptions } from './options';
import { field, link, localeFor, send } from './send';
import type { JanusMail } from './types';

type NoticeMails = Pick<
	JanusMail<string>,
	'passwordChanged' | 'emailChanged' | 'twoFactorEnabled' | 'twoFactorDisabled'
>;

/** The notices that greet `to.name` at `to.email`, and link to `secureAccount()`. */
type PlainNotice = 'passwordChanged' | 'twoFactorEnabled' | 'twoFactorDisabled';

/** The notices, over the resolved options. */
export function noticeMails(options: ResolvedOptions): NoticeMails {
	const { brand, links } = options;
	const plain =
		(method: PlainNotice) =>
		// Async, so a wrong argument rejects as the other methods' do.
		async (to: unknown): ReturnType<NoticeMails[PlainNotice]> =>
			send(options, method, field(method, to, 'email'), {
				brand,
				name: field(method, to, 'name'),
				link: link(method, links.secureAccount(), 'secureAccount()'),
				locale: localeFor(options, to),
			});
	return {
		passwordChanged: plain('passwordChanged'),
		twoFactorEnabled: plain('twoFactorEnabled'),
		twoFactorDisabled: plain('twoFactorDisabled'),
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
