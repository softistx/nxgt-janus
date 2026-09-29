/**
 * The public types of `@nxgt/janus-mail`, in their generic form. The
 * implementation works on a degenericised mirror (`string` locales) and casts
 * once, in `janusMail()`.
 */
import type {
	Clock,
	IssuedCode,
	IssuedToken,
	StepUpByEmail,
} from '@nxgt/janus';
import type { Address, Mailer, SentMail, WantedLocales } from '@nxgt/mail';
import type { JanusMailLocale } from './generated/locales';
import type { JanusMailLinks } from './link-types';
import type { JanusMailTemplates } from './template-types';

export type { JanusMailLocale } from './generated/locales';
export type { JanusMailLinks } from './link-types';
export type {
	JanusMailTemplate,
	JanusMailTemplateName,
	JanusMailTemplates,
	JanusMailVariables,
} from './template-types';

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
 * What one send of `verifyEmail`, `resetPassword`, `signInCode`, `magicLink`
 * or `stepUp` may pass
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
	/**
	 * The sign-in link `auth.magicLink.request(email)` answered, once checked
	 * for `null`, to `issued.email` — its button and its fallback link built
	 * by `links.magicLink(issued.token)`, saying how long it stays valid.
	 * Greets nobody by name, as a sign-in code does not. A `TypeError`, before
	 * anything is rendered, when `janusMail()` was given no `links.magicLink`.
	 */
	magicLink(
		issued: IssuedToken,
		to?: Pick<Recipient, 'locale'>,
		options?: JanusMailSendOptions,
	): Promise<SentMail>;
	/**
	 * The code `auth.stepUp.request(user)` answered, once narrowed to
	 * `via: 'email'`, to `issued.email`, greeting `to.name`, saying how long
	 * the code lasts, with `links.secureAccount()` for a user who asked for
	 * nothing. Reads `via`, `code`, `email` and `expiresAt` only: the
	 * challenge never reaches the e-mail. A step-up confirmed with the user's
	 * app (`via: 'secondFactor'`) sends nothing: a compile error, and a
	 * `TypeError` in JavaScript.
	 */
	stepUp(
		issued: Pick<
			StepUpByEmail<unknown>,
			'via' | 'code' | 'email' | 'expiresAt'
		>,
		to: Recipient,
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
	/**
	 * Tells `to.email` two-factor authentication was turned on, with a link to
	 * secure the account — on the `user.secondFactorEnabled` event, or once
	 * `auth.secondFactor.activate` answered.
	 */
	twoFactorEnabled(
		to: Recipient & { readonly email: string },
	): Promise<SentMail>;
	/**
	 * Tells `to.email` two-factor authentication was turned off, with a link
	 * to secure the account — on the `user.secondFactorDisabled` event, which
	 * `auth.secondFactor.disable` sends only when it removed an active factor.
	 */
	twoFactorDisabled(
		to: Recipient & { readonly email: string },
	): Promise<SentMail>;
	/**
	 * Welcomes `to.email` to the brand, with a link to get started — on the
	 * `user.created` event, which `auth.create` and `auth.signUp` send once
	 * the user is inserted.
	 */
	welcome(to: Recipient & { readonly email: string }): Promise<SentMail>;
	/**
	 * Tells `to.email` a recovery code was used on their account, `when`, and
	 * how many are left, with a link to `links.recoveryCodes` — else
	 * `links.secureAccount` — on the `user.recoveryCodeUsed` event. The event
	 * names the user only: read the count with
	 * `auth.secondFactor.recoveryCodesLeft(event.userId)`.
	 *
	 * `when` is text, formatted in the recipient's locale and time zone.
	 * `recoveryCodesLeft` is the count, written as the preset's plural in the
	 * recipient's locale — "You have 1 recovery code left." — or, for a locale
	 * the default e-mails are not built in, the sentence itself.
	 */
	recoveryCodeUsed(
		to: Recipient & { readonly email: string },
		used: {
			readonly when: string;
			readonly recoveryCodesLeft: number | string;
		},
	): Promise<SentMail>;
	/**
	 * Tells `to.email` their account was signed in from a device they had
	 * not signed in from, `time`, on `device` — and `location`, when you know
	 * it — with a link to secure the account: once a sign-in answered
	 * `newDevice: true`, or on the `user.newDeviceSignedIn` event.
	 *
	 * Every value is your text, in the recipient's locale: `device` described
	 * from the request (`'Firefox on macOS'`), `time` formatted in their time
	 * zone. **Janus sees no IP**: `location` is yours to work out, and an
	 * e-mail without one says "Unknown" in its place — "Inconnu" in French.
	 */
	newSignIn(
		to: Recipient & { readonly email: string },
		signIn: {
			readonly device: string;
			readonly time: string;
			readonly location?: string;
		},
	): Promise<SentMail>;
	/** The templates in use: the defaults, with `templates` over them. */
	readonly templates: JanusMailTemplates<L>;
	/** The locales sent in. */
	readonly locales: readonly L[];
}
