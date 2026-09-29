/**
 * The public types of the templates, in their generic form: what each e-mail
 * is given, and the function that renders it. Re-exported by `./types`.
 */
import type { Rendered } from '@nxgt/mail';
import type { JanusMailLocale } from './generated/locales';

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
	/** No `name`: the e-mail greets nobody, as the sign-in code's does not. */
	readonly magicLink: {
		readonly brand: string;
		readonly link: string;
		readonly expiresIn: string;
	};
	/**
	 * `link` is where the account is secured, for a user who asked for no
	 * step-up. No `challenge`, ever, as for the sign-in code.
	 */
	readonly stepUp: {
		readonly brand: string;
		readonly name: string;
		readonly code: string;
		readonly expiresIn: string;
		readonly link: string;
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
	readonly twoFactorEnabled: {
		readonly brand: string;
		readonly name: string;
		readonly link: string;
	};
	readonly twoFactorDisabled: {
		readonly brand: string;
		readonly name: string;
		readonly link: string;
	};
	/**
	 * `when` is the sender's text, already in the recipient's locale and time
	 * zone; `recoveryCodesLeft` the sentence of the codes left — "You have 9
	 * recovery codes left." — formatted by `recoveryCodeUsed` from the count,
	 * or the send's own text.
	 */
	readonly recoveryCodeUsed: {
		readonly brand: string;
		readonly name: string;
		readonly when: string;
		readonly recoveryCodesLeft: string;
		readonly link: string;
	};
	/**
	 * `device`, `time` and `location` are the sender's text, already in the
	 * recipient's locale. Without a `location` from the sender, it is
	 * "Unknown location" in the send's locale — "Lieu inconnu" in `fr`, the
	 * language's text for a regional `en` or `fr` tag, `en`'s for any other.
	 * `link` is where the account is secured.
	 */
	readonly newSignIn: {
		readonly brand: string;
		readonly name: string;
		readonly device: string;
		readonly location: string;
		readonly time: string;
		readonly link: string;
	};
	/** `name` is in the subject too: "Welcome, Ada". */
	readonly welcome: {
		readonly brand: string;
		readonly name: string;
		readonly link: string;
	};
}

/** The name of one of the twelve templates: `verifyEmail`, `resetPassword`, … */
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

/** The twelve templates, each for the locales `L`. */
export type JanusMailTemplates<L extends string = JanusMailLocale> = {
	readonly [K in JanusMailTemplateName]: JanusMailTemplate<
		JanusMailVariables[K],
		L
	>;
};
