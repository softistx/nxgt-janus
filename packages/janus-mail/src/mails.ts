/**
 * The default e-mails, and the one renderer that reads them.
 *
 * The built e-mails are inlined in the JavaScript (`./generated/inline-mails`,
 * written by `scripts/build-mail.ts`), so the package finds them wherever its
 * code ends up — in particular inside an application's own bundle, where no
 * `mails/` folder sits beside `import.meta.url`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createMailRenderer, type MailRenderer } from '@nxgt/mail/renderer';
import { INLINE_MAILS } from './generated/inline-mails';
import type { MailEmails } from './generated/mail';

/**
 * Temporary, until @nxgt/mail#112 (`createMailRenderer({ files })`): the
 * renderer reads a folder, so the inlined files are written to a private
 * folder (`mkdtemp`, mode 0700, one per call), the renderer is created from it
 * — it reads everything when created — and the folder is removed again, in a
 * `finally`. No path is shared between processes, nothing is left behind.
 *
 * A base folder that cannot be written throws an `Error` naming it, with the
 * system's error as `cause`.
 */
export function withMailsFolder<T>(
	use: (dir: string) => T,
	files: Readonly<Record<string, string>> = INLINE_MAILS,
	base: string = tmpdir(),
): T {
	let dir: string;
	try {
		dir = mkdtempSync(join(base, 'nxgt-janus-mail-'));
	} catch (error) {
		throw new Error(
			`janus-mail: cannot write the default e-mails under ${base} — make TMPDIR writable, or pass every template yourself`,
			{ cause: error },
		);
	}
	try {
		for (const [path, content] of Object.entries(files)) {
			const target = join(dir, path);
			mkdirSync(dirname(target), { recursive: true });
			writeFileSync(target, content);
		}
		return use(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

let renderer: MailRenderer<MailEmails> | undefined;

/**
 * The renderer of the default e-mails, created on first use and shared by
 * every `janusMail()` and `janusTemplates()` after it.
 *
 * Lazy, so importing the package writes nothing: an application that
 * overrides every template never touches the temporary folder.
 */
export function defaultRenderer(): MailRenderer<MailEmails> {
	renderer ??= withMailsFolder((dir) =>
		createMailRenderer<MailEmails>({ dir }),
	);
	return renderer;
}
