/**
 * The two notices of a change the user made — or someone else did:
 * `passwordChanged` and `emailChanged`. Each links to where the account is
 * secured.
 */
import type { ResolvedOptions } from './options';
import { field, link, localeFor, send } from './send';
import type { JanusMail } from './types';

type NoticeMails = Pick<JanusMail<string>, 'passwordChanged' | 'emailChanged'>;

/** `passwordChanged` and `emailChanged`, over the resolved options. */
export function noticeMails(options: ResolvedOptions): NoticeMails {
	const { brand, links } = options;
	return {
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
