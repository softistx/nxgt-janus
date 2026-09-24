import { describe, expect, it } from 'bun:test';
import { isSubjectSet, type Subject, subjectOf } from './subject';

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
