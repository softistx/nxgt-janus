/**
 * What a user type with an e-mail answers besides: signing in with a link
 * sent to it.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

import type { IssuedToken } from './email-flows';
import type { SignedIn } from './sign-in';

/**
 * Signing in with a link sent to the user's e-mail, no password needed —
 * a sign-in code with nothing to type.
 *
 * `Answer` is `SignInResult` when the type may have a second factor: the
 * link proves the e-mail, and an active factor is still asked for.
 */
export interface MagicLinkApi<U, Answer = SignedIn<U>> {
	readonly magicLink: {
		/**
		 * Issues a link's token for the user of this type holding this e-mail,
		 * or answers `null` when there is none, or they are inactive. **Never
		 * tell the visitor which**: answer the same page either way, and in the
		 * same time — send the e-mail off the request's path.
		 *
		 * Put `token` in a link to a page of yours, and **only in the e-mail**.
		 * The user's earlier links are spent: only the last one sent works.
		 * **Rate-limit it, per e-mail and per client**: every call sends an
		 * e-mail.
		 */
		request(
			email: string,
		): Promise<(IssuedToken & { readonly user: U }) | null>;
		/**
		 * Spends the link's token, marks the e-mail verified — the link reached
		 * the inbox — and signs the user in. **An e-mail proved for the first
		 * time drops the password and the second factor, and signs out every
		 * session** before the new one opens: whoever registered the address
		 * without its inbox keeps nothing, and no factor is asked for. An
		 * e-mail already verified changes nothing.
		 *
		 * **Call it from a `POST`**, never from the `GET` of the link: a mail
		 * scanner that opens the link would spend it. An unknown, spent or
		 * lapsed token is `TOKEN_UNKNOWN`, `TOKEN_SPENT` or `TOKEN_EXPIRED`; an
		 * e-mail the user changed since is `TOKEN_STALE`; an inactive user is
		 * `USER_INACTIVE`. The first call spends the token, whether it signs
		 * in or is refused.
		 */
		confirm(token: string): Promise<Answer>;
	};
}
