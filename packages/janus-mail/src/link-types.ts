/**
 * The links of the e-mails, in their own file for its length. Re-exported
 * by `./types`.
 */

/**
 * The links of the e-mails, each an absolute `http(s)` URL of your
 * application. Each is called at send time and must answer a string
 * synchronously: an `async` function or a `URL` object is a compile error,
 * and from JavaScript, or through a cast, the send throws a `TypeError`
 * naming the call. A
 * `mailto:` URL is accepted too — `secureAccount: () => 'mailto:security@acme.example'`
 * sends the user to your support desk; any other scheme is refused by the
 * renderer with a `MailRefused`. The functions are copied when `janusMail()`
 * is called: replacing one afterwards changes nothing.
 */
export interface JanusMailLinks {
	/** The page that confirms an e-mail, given the one-time token: `(token) => \`https://app.example/verify?token=${token}\`` */
	readonly verifyEmail: (token: string) => string;
	/** The page that sets a new password, given the one-time token. */
	readonly resetPassword: (token: string) => string;
	/**
	 * Where a user who did not make a change secures their account — their
	 * security settings. `passwordChanged`, `emailChanged`, `twoFactorEnabled`,
	 * `twoFactorDisabled` and `newSignIn` link to it, and so does `stepUp`, for
	 * a user who asked for no code.
	 */
	readonly secureAccount: () => string;
	/**
	 * Where a new user starts — your application's home, or its sign-in page
	 * for an account someone else created. `welcome` links to it, from its
	 * "Get started" button.
	 */
	readonly getStarted: () => string;
	/**
	 * Where a user regenerates their recovery codes — `recoveryCodeUsed`
	 * links to it, from its "Secure my account" button. **Optional**: without
	 * it, that e-mail links to `secureAccount`, the security settings where
	 * the codes usually are.
	 */
	readonly recoveryCodes?: () => string;
	/**
	 * The page a sign-in link opens, given its one-time token —
	 * `magicLink` links to it. **Optional**, for an application that sends no
	 * sign-in link; without it, `magicLink` throws a `TypeError` before
	 * anything is rendered. That page spends nothing: its button posts the
	 * token to the route that calls `auth.magicLink.confirm`, so a mail
	 * scanner that opens the link does not sign in for the user.
	 */
	readonly magicLink?: (token: string) => string;
}
