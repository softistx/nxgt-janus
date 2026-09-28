/**
 * The e-mails about the account itself, sent on what happened to it rather
 * than on a flow's answer: the notices of a change the user made — or someone
 * else did — `passwordChanged`, `emailChanged`, `twoFactorEnabled` and
 * `twoFactorDisabled`, each linking to where the account is secured; and
 * `welcome`, once it was created, linking to where a new user starts.
 */
import type { ResolvedOptions } from './options';
import { field, link, localeFor, send } from './send';
import type { JanusMail } from './types';

type NoticeMails = Pick<
	JanusMail<string>,
	| 'passwordChanged'
	| 'emailChanged'
	| 'twoFactorEnabled'
	| 'twoFactorDisabled'
	| 'welcome'
>;

/** The e-mails that greet `to.name` at `to.email`, and link to one of `links`. */
type PlainNotice =
	| 'passwordChanged'
	| 'twoFactorEnabled'
	| 'twoFactorDisabled'
	| 'welcome';

/** The links a plain notice may take: those called with nothing. */
type PlainLink = 'secureAccount' | 'getStarted';

/** The notices and the welcome, over the resolved options. */
export function noticeMails(options: ResolvedOptions): NoticeMails {
	const { brand, links } = options;
	const plain =
		(method: PlainNotice, target: PlainLink) =>
		// Async, so a wrong argument rejects as the other methods' do.
		async (to: unknown): ReturnType<NoticeMails[PlainNotice]> =>
			send(options, method, field(method, to, 'email'), {
				brand,
				name: field(method, to, 'name'),
				link: link(method, links[target](), `${target}()`),
				locale: localeFor(options, to),
			});
	return {
		passwordChanged: plain('passwordChanged', 'secureAccount'),
		twoFactorEnabled: plain('twoFactorEnabled', 'secureAccount'),
		twoFactorDisabled: plain('twoFactorDisabled', 'secureAccount'),
		welcome: plain('welcome', 'getStarted'),
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
