/**
 * `@nxgt/janus-mail` — the e-mails of `@nxgt/janus`'s flows.
 *
 * `@nxgt/janus` sends no e-mail: its flows answer what to send — a one-time
 * token, a sign-in code, a sign-in link's token, a step-up's code, the
 * address — and this package turns that answer into an e-mail and hands it
 * to an `@nxgt/mail` transport. Twelve e-mails, in
 * English and French, prebuilt with Maizzle when this package is built, and
 * filled at send time with your brand, the recipient's name and your links.
 * Any of them can be replaced by a function of your own.
 *
 * ## The rule this package is built around
 *
 * **A send that fails throws.** Every method rejects with the mailer's
 * `MailFailure` or `MailRefused`, untouched — never wrapped, never mapped to
 * `false` — so a user is never told to check an inbox that will stay empty.
 */
export { janusMail } from './janus-mail';
export { janusTemplates } from './templates';
export type {
	JanusMail,
	JanusMailLinks,
	JanusMailLocale,
	JanusMailOptions,
	JanusMailSendOptions,
	JanusMailTemplate,
	JanusMailTemplateName,
	JanusMailTemplates,
	JanusMailVariables,
	Recipient,
} from './types';
