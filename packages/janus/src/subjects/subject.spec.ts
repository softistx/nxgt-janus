import { describe, expect, it } from 'bun:test';
import {
	isSetOf,
	isSubjectSet,
	type Subject,
	setOf,
	subjectOf,
} from './subject';

describe('isSubjectSet', () => {
	it('tells one entity from everyone who holds a relation on one', () => {
		expect(isSubjectSet({ type: 'staff', id: 'u1' })).toBe(false);
		expect(isSubjectSet({ type: 'team', id: 't1', relation: 'member' })).toBe(
			true,
		);
	});

	it('narrows, so reading the relation needs no cast', () => {
		const subject: Subject = { type: 'team', id: 't1', relation: 'member' };

		if (isSubjectSet(subject)) {
			// Would not compile without the narrowing.
			expect(subject.relation).toBe('member');
		} else {
			throw new Error('expected a subject set');
		}
	});
});

describe('subjectOf', () => {
	it('is the join between users and permissions: a user is a subject by its type and id', () => {
		expect(subjectOf({ type: 'staff', id: '018f-abc' })).toEqual({
			type: 'staff',
			id: '018f-abc',
		});
	});

	it('keeps none of the user’s own fields, so none reaches a tuple', () => {
		// A user's fields are flat on it; one named `relation` would make the
		// user itself read as a subject set.
		const user = { type: 'staff', id: 'u1', relation: 'cousin', name: 'Ada' };

		const subject = subjectOf(user);

		expect(subject).toEqual({ type: 'staff', id: 'u1' });
		expect(isSubjectSet(subject)).toBe(false);
	});
});

describe('setOf', () => {
	const ada = { type: 'staff', id: 'u1', email: 'ada@example.com' } as const;

	it('keeps type and id only, and is frozen', () => {
		const set = setOf(ada, 'managers');

		expect(Object.keys(set).sort()).toEqual(['id', 'relation', 'type']);
		expect(Object.isFrozen(set)).toBe(true);
		expect(isSetOf(set)).toBe(true);
	});

	it('is kept by a spread, and lost through JSON or structuredClone', () => {
		const set = setOf(ada, 'managers');

		expect(isSetOf({ ...set })).toBe(true);
		expect(isSetOf(Object.assign({}, set))).toBe(true);
		expect(isSetOf(JSON.parse(JSON.stringify(set)))).toBe(false);
		expect(isSetOf(structuredClone(set))).toBe(false);
	});

	it('is never read from a user, whatever its fields', () => {
		expect(isSetOf({ ...ada, relation: 'managers' })).toBe(false);
		expect(isSetOf(null)).toBe(false);
		expect(isSetOf('staff:u1#managers')).toBe(false);
	});

	const refused = [
		[
			'no entity',
			null,
			'managers',
			'setOf: pass a user or { type, id }, then a relation',
		],
		[
			'an entity without id',
			{ type: 'staff' },
			'managers',
			'setOf: pass a user or { type, id }, then a relation',
		],
		[
			'an empty relation',
			{ type: 'staff', id: 'u1' },
			'',
			'setOf: the relation must be a non-empty string',
		],
		[
			'a relation that is no string',
			{ type: 'staff', id: 'u1' },
			42,
			'setOf: the relation must be a non-empty string',
		],
	] as const;
	for (const [name, entity, relation, message] of refused) {
		it(`refuses ${name}`, () => {
			const call = () => setOf(entity as never, relation as never);

			expect(call).toThrow(TypeError);
			expect(call).toThrow(message);
		});
	}
});
