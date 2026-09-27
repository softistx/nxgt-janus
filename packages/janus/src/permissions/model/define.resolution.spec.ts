import { describe, expect, it } from 'bun:test';
import { defineModel, resolvedOf } from './define';
import { define, subjects } from './define.fixtures';
import { fromField } from './from-field';
import { when } from './when';

const clinic = () =>
	defineModel({
		subjects,
		types: {
			team: {
				related: { members: ['staff', 'team#members'], leads: ['staff'] },
				permits: { manage: ['leads'], view: ['members', 'manage'] },
			},
			record: {
				related: {
					doctors: fromField('doctorId', 'staff'),
					teams: ['team'],
				},
				permits: {
					view: ['doctors', 'teams->view', 'edit'],
					edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
				},
			},
		},
	});

describe('defineModel', () => {
	it('answers the subject and object types, and the definition as written', () => {
		const model = clinic();

		expect(model.subjects).toEqual(['patient', 'staff']);
		expect(model.types).toEqual(['team', 'record']);
		expect(Object.isFrozen(model)).toBe(true);
	});

	it('parses every rule once: names, arrows, subject sets, fields and conditions', () => {
		const record = resolvedOf(clinic()).types.get('record');
		const team = resolvedOf(clinic()).types.get('team');

		expect(team?.relations.get('members')).toEqual({
			kind: 'stored',
			holders: [
				{ kind: 'type', type: 'staff' },
				{ kind: 'set', type: 'team', relation: 'members' },
			],
		});
		expect(record?.relations.get('doctors')).toEqual({
			kind: 'fromField',
			field: 'doctorId',
			subject: 'staff',
		});
		const [doctor, arrow, edit] = record?.permissions.get('view') ?? [];
		expect(doctor).toEqual({ kind: 'name', name: 'doctors' });
		expect(arrow).toEqual({ kind: 'arrow', relation: 'teams', target: 'view' });
		expect(edit).toEqual({ kind: 'name', name: 'edit' });
		const [conditional] = record?.permissions.get('edit') ?? [];
		expect(conditional?.kind).toBe('name');
		expect(typeof conditional?.test).toBe('function');
	});

	it('accepts a loop that crosses a relation: data ends it, not the model', () => {
		expect(
			define({
				subjects,
				types: {
					folder: {
						related: { parents: ['folder'], owners: ['staff'] },
						permits: { view: ['owners', 'parents->view'] },
					},
				},
			}),
		).not.toThrow();
	});

	it('refuses a model it did not make', () => {
		expect(() => resolvedOf({})).toThrow('was not made by defineModel()');
	});
});

describe('a user type that is also an object type', () => {
	it('is defined like any object type, and stays a subject type', () => {
		const model = defineModel({
			subjects,
			types: {
				staff: {
					related: { managers: ['staff', 'staff#managers'] },
					permits: { edit: ['managers'] },
				},
			},
		});

		expect(model.subjects).toEqual(['patient', 'staff']);
		expect(model.types).toEqual(['staff']);
		expect(
			resolvedOf(model).types.get('staff')?.relations.get('managers'),
		).toEqual({
			kind: 'stored',
			holders: [
				{ kind: 'type', type: 'staff' },
				{ kind: 'set', type: 'staff', relation: 'managers' },
			],
		});
	});
});
