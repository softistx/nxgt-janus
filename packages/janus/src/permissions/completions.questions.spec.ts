import { describe, expect, it } from 'bun:test';
import { completionsIn, LANGUAGE_SERVICE_MS } from './completions.fixtures';

const QUESTIONS = `
import { defineModel, fromField, permissions } from './index';
import { createMemoryRelations } from './port/memory';

const access = permissions({
	model: defineModel({
		subjects: ['staff'],
		types: {
			team: { related: { members: ['staff'] }, permits: { view: ['members'] } },
			record: {
				related: { owners: ['staff'], doctors: fromField('doctorId', 'staff'), teams: ['team'] },
				permits: { view: ['owners', 'teams->view'], read: ['owners', 'doctors'] },
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

	it(
		"offers can() the object's relations and permissions, not another type's",
		() => {
			// `teams` is record's relation; `members` is team's.
			expect(at(0)?.sort()).toEqual([
				'doctors',
				'owners',
				'read',
				'teams',
				'view',
			]);
		},
		LANGUAGE_SERVICE_MS,
	);

	it(
		'offers list() only what it can reverse',
		() => {
			// doctors, and read through it, are read from a field with no lookup.
			expect(at(1)?.sort()).toEqual(['owners', 'teams', 'view']);
		},
		LANGUAGE_SERVICE_MS,
	);

	it(
		'offers grant() the relations it can write',
		() => {
			expect(at(2)?.sort()).toEqual(['owners', 'teams']);
		},
		LANGUAGE_SERVICE_MS,
	);
});
