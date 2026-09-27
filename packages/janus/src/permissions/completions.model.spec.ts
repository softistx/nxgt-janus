import { describe, expect, it } from 'bun:test';
import ts from 'typescript';
import {
	completionsIn,
	FILE,
	LANGUAGE_SERVICE_MS,
	serviceOver,
} from './completions.fixtures';

/** A model with a cursor in each place an editor should complete a name. */
const MODEL = `
import { defineModel, fromField, when } from './index';

// As auth.types is typed.
const subjects = ['patient', 'staff'] as readonly ('patient' | 'staff')[];

defineModel({
	subjects,
	types: {
		team: {
			related: { members: ['staff', 'team#members'], leads: ['staff'] },
			permits: { manage: ['leads'], view: ['members', 'manage'] },
		},
		record: {
			related: {
				owners: ['§'],
				teams: ['team'],
				doctors: fromField('doctorId', '§'),
			},
			permits: {
				view: ['owners', '§'],
				edit: [when('§', (ctx: { locked: boolean }) => !ctx.locked)],
			},
		},
	},
});
`;

describe('an editor completes a model', () => {
	// Asked once, on first use, so a failure to ask fails a named case.
	let asked: string[][] | undefined;
	const at = (cursor: number) => {
		asked ??= completionsIn(MODEL);
		return asked[cursor];
	};

	it(
		"offers a relation's subject types and subject sets",
		() => {
			expect(at(0)).toEqual(
				expect.arrayContaining([
					'patient',
					'staff',
					'team',
					'record',
					'team#members',
					'team#leads',
					'record#owners',
				]),
			);
			// A fromField is read from one object's data: never a subject set.
			expect(at(0)).not.toContain('record#doctors');
		},
		LANGUAGE_SERVICE_MS,
	);

	it(
		"offers a fromField's subject types",
		() => {
			expect(at(1)?.sort()).toEqual(['patient', 'record', 'staff', 'team']);
		},
		LANGUAGE_SERVICE_MS,
	);

	it(
		"offers a rule's relations, other permissions and arrows, in when() too",
		() => {
			const names = ['owners', 'doctors', 'teams', 'teams->view'];
			// The cursors sit in `view` and in `edit`: each offers the other.
			expect(at(2)).toEqual(expect.arrayContaining([...names, 'edit']));
			expect(at(3)).toEqual(expect.arrayContaining([...names, 'view']));
		},
		LANGUAGE_SERVICE_MS,
	);

	it(
		'never offers a permission its own name: a loop no relation ends',
		() => {
			expect(at(2)).not.toContain('view');
			expect(at(3)).not.toContain('edit');
		},
		LANGUAGE_SERVICE_MS,
	);
});

describe('a wrong name in a model', () => {
	it(
		'is refused with the names it could have been',
		() => {
			const [first, ...rest] = MODEL.split('§');
			// The name to refuse first, then a valid name at each other cursor.
			const text = ['staf', 'staff', 'owners', 'owners'].reduce(
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
			expect(refusal).toContain('"team#members"');
			expect(refusal).toContain('Did you mean \'"staff"\'?');
		},
		LANGUAGE_SERVICE_MS,
	);
});
