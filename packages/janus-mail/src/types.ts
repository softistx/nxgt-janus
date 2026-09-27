/**
 * The public types of `@nxgt/janus-mail`, in their generic form. The
 * implementation works on a degenericised mirror (`string` locales) and casts
 * once, in `janusMail()`.
 */
import type { Clock, IssuedCode, IssuedToken } from '@nxgt/janus';
import type {
	Address,
	Mailer,
	Rendered,
	SentMail,
	WantedLocales,
} from '@nxgt/mail';
import type { JanusMailLocale } from './generated/locales';

export type { JanusMailLocale } from './generated/locales';

/**
 * What each e-mail's template is given, by template name. Every value is
 * text: `brand` is the name `janusMail({ brand })` was given, `name` the
 * recipient's, `link` an absolute URL from `links`, and `expiresIn` how long
 * the link or the code stays valid, in the recipient's locale — "1 hour",
 * "1 heure" — or the send's own `expiresIn`.
 *
 * Held equal to the build's variables by `test/types/variables.ts`: an e-mail
 * of the build that gains or loses a variable fails the typecheck there.
 */
export interface JanusMailVariables {
	readonly verifyEmail: {
		readonly brand: string;
		readonly name: string;
		readonly link: string;
		readonly expiresIn: string;
	};
	readonly resetPassword: {
		readonly brand: string;
		readonly name: string;
		readonly link: string;
		readonly expiresIn: string;
	};
	/** No `challenge`, ever: it is the visitor's secret, and never goes in an e-mail. */
	readonly signInCode: {
		readonly brand: string;
		readonly code: string;
		readonly expiresIn: string;
	};
	readonly passwordChanged: {
		readonly brand: string;
		readonly name: string;
		readonly link: string;
	};
	readonly emailChanged: {
		readonly brand: string;
		readonly name: string;
		readonly link: string;
		readonly newEmail: string;
	};
}

/** The name of one of the five templates: `verifyEmail`, `resetPassword`, … */
export type JanusMailTemplateName = keyof JanusMailVariables;

/**
 * One e-mail: its variables and the locale picked for the recipient, in; its
 * `subject`, `html` and `text`, out — escaping is then the function's job. A
 * default, from the prebuilt e-mails, or yours: React Email, a string, or
 * another Maizzle build.
 */
export type JanusMailTemplate<V, L extends string = JanusMailLocale> = (
	variables: V & { readonly locale: L },
) => Rendered | PromiseLike<Rendered>;

/** The five templates, each for the locales `L`. */
export type JanusMailTemplates<L extends string = JanusMailLocale> = {
	readonly [K in JanusMailTemplateName]: JanusMailTemplate<
		JanusMailVariables[K],
		L
	>;
};

/**
 * Who an e-mail is for, besides the address: the name it greets, and the
 * locales they want, most wanted first — their stored locale, then their
 * `Accept-Language` when they are the visitor. Picked with `pickLocale`:
 * `fr-CA` sends `fr`, and nothing matching sends the fallback locale.
 */
export interface Recipient {
	readonly name: string;
	readonly locale?: WantedLocales;
}

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
	/** Where a user who did not make a change secures their account — `passwordChanged` and `emailChanged` link to it. */
	readonly secureAccount: () => string;
}

/** The options every locale set shares. */
interface JanusMailBaseOptions<L extends string> {
	/** The transport — `@nxgt/mail-smtp`, `@nxgt/mail-resend`, or `createMemoryMailer()` in tests. */
	readonly mailer: Mailer;
	/** The sender of every e-mail. */
	readonly from: Address;
	/** Where a reply goes, when not to `from`. */
	readonly replyTo?: Address;
	/** The name the e-mails show — in the header, the body and the footer. Text only. */
	readonly brand: string;
	readonly links: JanusMailLinks;
	/** The locales to send in. Default the built ones, `['en', 'fr']`. */
	readonly locales?: readonly L[];
	/** The locale when the recipient wants none of `locales`. Default `en`, else the first of `locales`. */
	readonly fallbackLocale?: NoInfer<L>;
	/**
	 * What the time left until a flow's `expiresAt` is measured against: pass
	 * the clock given to `janus({ clock })` — a `fixedClock` in tests. Default
	 * the system clock.
	 */
	readonly clock?: Clock;
}

/**
 * What one send of `verifyEmail`, `resetPassword` or `signInCode` may pass
 * besides the flow's answer and the recipient.
 */
export interface JanusMailSendOptions {
	/**
	 * How long the link or the code stays valid, as the e-mail shows it —
	 * plain text, already in the recipient's language: `'24 heures'`. Default:
	 * the time left until the flow's `expiresAt`, in the largest whole unit,
	 * in the recipient's locale.
	 */
	readonly expiresIn?: string;
}

/**
 * `janusMail()`'s options. `templates` replaces any of the defaults — and
 * **every** one once `locales` holds a locale the defaults are not built in:
 * a default could not render it.
 */
export type JanusMailOptions<L extends string = JanusMailLocale> =
	JanusMailBaseOptions<L> &
		([L] extends [JanusMailLocale]
			? { readonly templates?: Partial<JanusMailTemplates<L>> }
			: { readonly templates: JanusMailTemplates<L> });

/**
 * The e-mails of Janus's flows, each sent to the address the flow answered.
 * Each method resolves once the mailer took the e-mail, with its answer, and
 * rejects with the mailer's `MailFailure` or `MailRefused`, untouched.
 */
export interface JanusMail<L extends string = JanusMailLocale> {
	/**
	 * What `auth.verifyEmail.send(user)` answered, to `issued.email`, saying
	 * how long the link stays valid — from `issued.expiresAt`, unless
	 * `options.expiresIn` says it.
	 */
	verifyEmail(
		issued: IssuedToken,
		to: Recipient,
		options?: JanusMailSendOptions,
	): Promise<SentMail>;
	/** What `auth.resetPassword.request(email)` answered, once checked for `null`, to `issued.email`. */
	resetPassword(
		issued: IssuedToken,
		to: Recipient,
		options?: JanusMailSendOptions,
	): Promise<SentMail>;
	/**
	 * The code `auth.signInCode.request(email)` answered, to `issued.email`.
	 * Reads `code`, `email` and `expiresAt` only: the challenge never reaches
	 * the e-mail.
	 */
	signInCode(
		issued: Pick<IssuedCode<unknown>, 'code' | 'email' | 'expiresAt'>,
		to?: Pick<Recipient, 'locale'>,
		options?: JanusMailSendOptions,
	): Promise<SentMail>;
	/** Tells `to.email` their password was changed, with a link to secure the account. */
	passwordChanged(
		to: Recipient & { readonly email: string },
	): Promise<SentMail>;
	/** Tells the **former** address that the e-mail changed to `newEmail`, with a link to secure the account. */
	emailChanged(
		to: Recipient & { readonly formerEmail: string; readonly newEmail: string },
	): Promise<SentMail>;
	/** The templates in use: the defaults, with `templates` over them. */
	readonly templates: JanusMailTemplates<L>;
	/** The locales sent in. */
	readonly locales: readonly L[];
}
