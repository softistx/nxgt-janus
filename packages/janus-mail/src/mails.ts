/**
 * Where the default e-mails are, and the one renderer that reads them.
 *
 * The package ships the built e-mails in `mails/`, beside `dist/` — not in
 * it, because the root `build.ts` removes from `dist/` every file it did not
 * write itself.
 */
import { fileURLToPath } from 'node:url';
import { createMailRenderer, type MailRenderer } from '@nxgt/mail/renderer';
import type { MailEmails } from './generated/mail';

/**
 * The folder of the built e-mails, resolved from this module rather than from
 * the working directory, which is the consumer's.
 *
 * **This file must stay directly under `src/`.** `../mails/` is right from
 * `src/mails.ts` in the specs, and from `dist/index.js` in the tarball,
 * because the build bundles this module into the single entry
 * `dist/index.js`, one level under the package as `src/` is. Moved into a
 * subfolder, or bundled into `dist/chunks/` by a second entry point, it would
 * resolve a folder that does not exist — which the artifact spec, rendering
 * from `../dist`, would catch.
 */
export const MAILS_DIR = fileURLToPath(new URL('../mails/', import.meta.url));

let renderer: MailRenderer<MailEmails> | undefined;

/**
 * The renderer of the default e-mails, created on first use and shared by
 * every `janusMail()` and `janusTemplates()` after it.
 *
 * Lazy, so importing the package reads nothing: an application that
 * overrides every template never opens `mails/`. The first default template
 * rendered reads the whole build once — a missing `mails/` throws there, with
 * `createMailRenderer`'s own message.
 */
export function defaultRenderer(): MailRenderer<MailEmails> {
	renderer ??= createMailRenderer<MailEmails>({ dir: MAILS_DIR });
	return renderer;
}
