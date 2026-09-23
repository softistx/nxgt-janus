import { describe, expect, it } from 'bun:test';
import { isSubjectSet, type Subject, subjectOf } from './subject';

describe('isSubjectSet', () => {
	it('tells one person from everyone who holds a relation', () => {
		expect(isSubjectSet('alice')).toBe(false);
		expect(
			isSubjectSet({
				subjectSet: { namespace: 'Group', object: 'eng', relation: 'members' },
			}),
		).toBe(true);
	});

	it('narrows, so reading the set needs no cast', () => {
		const subject: Subject = {
			subjectSet: { namespace: 'Group', object: 'eng', relation: 'members' },
		};

		if (isSubjectSet(subject)) {
			// Would not compile without the narrowing.
			expect(subject.subjectSet.relation).toBe('members');
		} else {
			throw new Error('expected a subject set');
		}
	});
});

describe('subjectOf', () => {
	it('is the join between identities and permissions, and it is a function', () => {
		// In Ory this equality is a comment repeated in three repositories. The
		// point of writing it as a function is that there is one place to read,
		// and one place that would have to change.
		expect(subjectOf({ id: '018f-abc' })).toBe('018f-abc');
	});

	it('takes the narrowest shape it reads, so a session works too', () => {
		// Deliberately `{ id }` and not `Identity`: the permissions module never
		// has to know what an identity is.
		const session = { id: 'sess-1', identityId: '018f-abc' };

		expect(subjectOf({ id: session.identityId })).toBe('018f-abc');
	});
});
