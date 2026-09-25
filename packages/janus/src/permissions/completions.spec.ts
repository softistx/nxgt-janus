import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * What an editor offers while a model is being written — measured with the
 * TypeScript language service, the one every editor asks.
 *
 * A model that refuses a wrong name but offers no right one is typed and still
 * unhelpful: `defineModel` once checked `C & Checked<C>`, which refused every
 * mistake below and completed nothing at all. `§` marks where the cursor is.
 */

const PACKAGE = join(import.meta.dir, '../..');
const FILE = join(import.meta.dir, '__completions__.ts');

const MODEL = `
import { defineModel, fromField, when } from './index';

// As auth.types is typed.
const subjects = ['patient', 'staff'] as readonly ('patient' | 'staff')[];

defineModel({
	subjects,
	types: {
		team: {
			relations: { member: ['staff', 'team#member'], lead: ['staff'] },
			permissions: { manage: ['lead'], view: ['member', 'manage'] },
		},
		record: {
			relations: {
				owner: ['§'],
				team: ['team'],
				doctor: fromField('doctorId', '§'),
			},
			permissions: {
				view: ['owner', '§'],
				edit: [when('§', (ctx: { locked: boolean }) => !ctx.locked)],
			},
		},
	},
});
`;

/** A language service over one file, `FILE`, holding `text`. */
function serviceOver(text: string): ts.LanguageService {
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
function completionsIn(source: string): string[][] {
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

describe('an editor completes a model', () => {
	const [holder, fromFieldSubject, rule, whenRule] = completionsIn(MODEL);

	it("offers a relation's subject types and subject sets", () => {
		expect(holder).toEqual(
			expect.arrayContaining([
				'patient',
				'staff',
				'team',
				'record',
				'team#member',
				'team#lead',
				'record#owner',
			]),
		);
		// A fromField is read from one object's data: never a subject set.
		expect(holder).not.toContain('record#doctor');
	});

	it("offers a fromField's subject types", () => {
		expect(fromFieldSubject?.sort()).toEqual([
			'patient',
			'record',
			'staff',
			'team',
		]);
	});

	it("offers a rule's relations, permissions and arrows, in when() too", () => {
		const names = ['owner', 'doctor', 'team', 'edit', 'team->view'];
		expect(rule).toEqual(expect.arrayContaining(names));
		expect(whenRule).toEqual(expect.arrayContaining(names));
	});
});

describe('a wrong name in a model', () => {
	it('is refused with the names it could have been', () => {
		const [first, ...rest] = MODEL.split('§');
		// The name to refuse first, then a valid name at each other cursor.
		const text = ['staf', 'staff', 'owner', 'owner'].reduce(
			(done, name, at) => done + name + (rest[at] ?? ''),
			first ?? '',
		);
		const [refusal, ...others] = serviceOver(text)
			.getSemanticDiagnostics(FILE)
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
			);

		expect(others).toEqual([]);
		// Spelled out, not the alias that computed them: `SubjectRefOf<…>`
		// would name the model back instead of the choices.
		expect(refusal).not.toMatch(/[A-Za-z]Of</);
		expect(refusal).toContain('"patient"');
		expect(refusal).toContain('"team#member"');
		expect(refusal).toContain('Did you mean \'"staff"\'?');
	});
});
