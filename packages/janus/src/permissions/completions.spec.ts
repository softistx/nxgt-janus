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
	// Asked once, on first use, so a failure to ask fails a named case.
	let asked: string[][] | undefined;
	const at = (cursor: number) => {
		asked ??= completionsIn(MODEL);
		return asked[cursor];
	};

	it("offers a relation's subject types and subject sets", () => {
		expect(at(0)).toEqual(
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
		expect(at(0)).not.toContain('record#doctor');
	});

	it("offers a fromField's subject types", () => {
		expect(at(1)?.sort()).toEqual(['patient', 'record', 'staff', 'team']);
	});

	it("offers a rule's relations, other permissions and arrows, in when() too", () => {
		const names = ['owner', 'doctor', 'team', 'team->view'];
		// The cursors sit in `view` and in `edit`: each offers the other.
		expect(at(2)).toEqual(expect.arrayContaining([...names, 'edit']));
		expect(at(3)).toEqual(expect.arrayContaining([...names, 'view']));
	});

	it('never offers a permission its own name: a loop no relation ends', () => {
		expect(at(2)).not.toContain('view');
		expect(at(3)).not.toContain('edit');
	});
});

const QUESTIONS = `
import { defineModel, fromField, permissions } from './index';
import { createMemoryRelations } from './port/memory';

const access = permissions({
	model: defineModel({
		subjects: ['staff'],
		types: {
			team: { relations: { member: ['staff'] }, permissions: { view: ['member'] } },
			record: {
				relations: { owner: ['staff'], doctor: fromField('doctorId', 'staff'), team: ['team'] },
				permissions: { view: ['owner', 'team->view'], read: ['owner', 'doctor'] },
			},
		},
	}),
	store: createMemoryRelations(),
});
const staff = { type: 'staff', id: 'u' } as const;

access.can(staff, '§', { type: 'record', id: 'r', doctorId: null });
access.list(staff, '§', 'record');
access.grant({ type: 'record', id: 'r' }, '§', staff);
`;

describe('an editor completes a question', () => {
	let asked: string[][] | undefined;
	const at = (cursor: number) => {
		asked ??= completionsIn(QUESTIONS);
		return asked[cursor];
	};

	it("offers can() the object's relations and permissions, not another type's", () => {
		// `team` is record's relation, not the type; `member` is team's.
		expect(at(0)?.sort()).toEqual(['doctor', 'owner', 'read', 'team', 'view']);
	});

	it('offers list() only what it can reverse', () => {
		// doctor, and read through it, are read from a field with no lookup.
		expect(at(1)?.sort()).toEqual(['owner', 'team', 'view']);
	});

	it('offers grant() the relations it can write', () => {
		expect(at(2)?.sort()).toEqual(['owner', 'team']);
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
