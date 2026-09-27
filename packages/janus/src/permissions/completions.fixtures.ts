import { join } from 'node:path';
import ts from 'typescript';

/**
 * What an editor offers while a model is being written — measured with the
 * TypeScript language service, the one every editor asks.
 *
 * A model that refuses a wrong name but offers no right one is typed and still
 * unhelpful: `defineModel` once checked `C & Checked<C>`, which refused every
 * mistake in `completions.*.spec.ts` and completed nothing at all. `§` marks
 * where the cursor is.
 */

/**
 * Every describe in `completions.*.spec.ts` starts a TypeScript language
 * service over the package — its first case does, or its one case: well under
 * a second on an idle machine, and 5.3 s —
 * past Bun's default 5 s — measured under CPU load, where the case timed out.
 * Every case carries the longer limit, since whichever runs first — or alone,
 * under a filter — pays for the start.
 */
export const LANGUAGE_SERVICE_MS = 30_000;

const PACKAGE = join(import.meta.dir, '../..');
export const FILE = join(import.meta.dir, '__completions__.ts');

/** A language service over one file, `FILE`, holding `text`. */
export function serviceOver(text: string): ts.LanguageService {
	const config = ts.getParsedCommandLineOfConfigFile(
		join(PACKAGE, 'tsconfig.json'),
		{},
		{ ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
	);
	if (config === undefined) throw new Error('tsconfig.json: unreadable');
	const read = (file: string) => (file === FILE ? text : ts.sys.readFile(file));
	const service = ts.createLanguageService({
		getScriptFileNames: () => [FILE],
		getScriptVersion: () => '1',
		getScriptSnapshot: (file) => {
			const content = read(file);
			return content === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(content);
		},
		getCurrentDirectory: () => PACKAGE,
		getCompilationSettings: () => config.options,
		getDefaultLibFileName: ts.getDefaultLibFilePath,
		fileExists: (file) => file === FILE || ts.sys.fileExists(file),
		readFile: read,
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
	});

	return service;
}

/** The string completions offered at each `§` of `source`, in order. */
export function completionsIn(source: string): string[][] {
	const cursors: number[] = [];
	let text = '';
	for (const part of source.split('§')) {
		text += part;
		cursors.push(text.length);
	}
	cursors.pop();
	const service = serviceOver(text);

	return cursors.map((cursor) =>
		(service.getCompletionsAtPosition(FILE, cursor, {})?.entries ?? [])
			.filter((entry) => entry.kind === ts.ScriptElementKind.string)
			.map((entry) => entry.name)
			.filter((name) => name !== ''),
	);
}
