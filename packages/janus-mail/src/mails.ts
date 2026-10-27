/**
 * The default e-mails, and the one renderer that reads them.
 *
 * The built e-mails are inlined in the JavaScript (`./generated/inline-mails`,
 * written by `scripts/build-mail.ts`), so the package finds them wherever its
 * code ends up — in particular inside an application's own bundle, where no
 * `mails/` folder sits beside `import.meta.url`. The renderer takes them from
 * memory (`createMailRenderer({ files })`): nothing is written anywhere.
 */
import { createMailRenderer, type MailRenderer } from '@nxgt/mail/renderer';
import { INLINE_MAILS } from './generated/inline-mails';
import type { MailEmails } from './generated/mail';

let renderer: MailRenderer<MailEmails> | undefined;

/**
 * The renderer of the default e-mails, created on first use and shared by
 * every `janusMail()` and `janusTemplates()` after it.
 *
 * Lazy, so importing the package reads nothing: an application that
 * overrides every template never builds it.
 */
export function defaultRenderer(): MailRenderer<MailEmails> {
	renderer ??= createMailRenderer<MailEmails>({ files: INLINE_MAILS });
	return renderer;
}
