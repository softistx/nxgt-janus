/**
 * The default e-mails, and the one renderer that reads them.
 *
 * The built e-mails are inlined in the JavaScript (`./generated/inline-mails`,
 * written by `scripts/build-mail.ts`), so the package finds them wherever its
 * code ends up — in particular inside an application's own bundle, where no
 * `mails/` folder sits beside `import.meta.url`. `@nxgt/mail`'s renderer reads
 * a folder, so the first render writes the inlined files once to the system's
 * temporary folder, in a folder named after their content.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createMailRenderer, type MailRenderer } from '@nxgt/mail/renderer';
import { INLINE_MAILS } from './generated/inline-mails';
import type { MailEmails } from './generated/mail';

const MANIFEST = 'mail-manifest.json';

/**
 * The folder holding the inlined e-mails, written on first call and reused by
 * every process of the same build: named by a hash of the content, it is
 * complete or absent — it is written aside and renamed into place.
 */
export function materializeMails(
	files: Readonly<Record<string, string>> = INLINE_MAILS,
	base: string = tmpdir(),
): string {
	const hash = createHash('sha256');
	for (const path of Object.keys(files).sort())
		hash
			.update(path)
			.update('\0')
			.update(files[path] ?? '')
			.update('\0');
	const dir = join(base, `nxgt-janus-mail-${hash.digest('hex').slice(0, 16)}`);
	if (existsSync(join(dir, MANIFEST))) return dir;

	const aside = `${dir}.${randomUUID()}`;
	try {
		for (const [path, content] of Object.entries(files)) {
			const target = join(aside, path);
			mkdirSync(dirname(target), { recursive: true });
			writeFileSync(target, content);
		}
		try {
			renameSync(aside, dir);
		} catch (error) {
			// Another process won the race: its folder holds the same content.
			if (!existsSync(join(dir, MANIFEST))) throw error;
		}
	} finally {
		rmSync(aside, { recursive: true, force: true });
	}
	return dir;
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
	renderer ??= createMailRenderer<MailEmails>({ dir: materializeMails() });
	return renderer;
}
