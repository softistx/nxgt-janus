import { describe, expect, it } from 'bun:test';
import {
	formatSubject,
	formatSubjectSet,
	formatTuple,
	parseSubject,
	parseTuple,
} from './notation';
import type { RelationTuple } from './subject';

const direct: RelationTuple = {
	namespace: 'Note',
	object: '1',
	relation: 'viewers',
	subject: 'alice',
};

const inherited: RelationTuple = {
	namespace: 'Note',
	object: '1',
	relation: 'viewers',
	subject: {
		subjectSet: { namespace: 'Group', object: 'eng', relation: 'members' },
	},
};

describe('formatTuple', () => {
	it('writes Zanzibar’s notation, which is what every reader already knows', () => {
		expect(formatTuple(direct)).toBe('Note:1#viewers@alice');
	});

	it('parenthesises a subject set, which Keto does not', () => {
		// Without the parentheses, `Note:1#viewers@Group:eng` and a subject id
		// containing a colon are ambiguous, and a notation that cannot
		// round-trip is a notation that lies in a log.
		expect(formatTuple(inherited)).toBe('Note:1#viewers@(Group:eng#members)');
	});

	it('formats a bare subject set without them, for a message', () => {
		expect(
			formatSubjectSet({
				namespace: 'Group',
				object: 'eng',
				relation: 'members',
			}),
		).toBe('Group:eng#members');
		expect(formatSubject('alice')).toBe('alice');
	});
});

describe('parseTuple', () => {
	it('reads back what formatTuple wrote, both shapes', () => {
		expect(parseTuple(formatTuple(direct))).toEqual(direct);
		expect(parseTuple(formatTuple(inherited))).toEqual(inherited);
	});

	it('refuses a string that is not a tuple, rather than half-parsing one', () => {
		// A permission question built from a malformed string is a question
		// whose answer means nothing.
		expect(() => parseTuple('Note:1#viewers')).toThrow(TypeError);
		expect(() => parseTuple('')).toThrow(/is not a relation tuple/);
		expect(() => parseTuple('alice')).toThrow(/namespace:object#relation/);
	});

	it('refuses Keto’s own bare subject set, and says how to write it', () => {
		expect(() => parseSubject('Group:eng#members')).toThrow(
			/write it in parentheses/,
		);
	});

	it('refuses with a bare TypeError, because no request is behind it', () => {
		// Nothing in this package reads a tuple off the network, so a bad string
		// came from a developer's own code. No handler should answer this.
		try {
			parseTuple('nonsense');
			throw new Error('expected a throw');
		} catch (error) {
			expect(error).toBeInstanceOf(TypeError);
		}
	});
});
