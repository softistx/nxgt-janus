import { describe, expect, it } from 'bun:test';
import {
	formatEntity,
	formatSubject,
	formatTuple,
	parseSubject,
	parseTuple,
} from './notation';
import type { RelationTuple } from './subject';

const direct: RelationTuple = {
	object: { type: 'record', id: 'r1' },
	relation: 'viewer',
	subject: { type: 'staff', id: 'u1' },
};

const inherited: RelationTuple = {
	object: { type: 'record', id: 'r1' },
	relation: 'viewer',
	subject: { type: 'team', id: 't1', relation: 'member' },
};

describe('formatTuple', () => {
	it('writes Zanzibar’s notation with typed subjects', () => {
		expect(formatTuple(direct)).toBe('record:r1#viewer@staff:u1');
		expect(formatTuple(inherited)).toBe('record:r1#viewer@team:t1#member');
	});

	it('formats an entity and a subject alone, for a message', () => {
		expect(formatEntity({ type: 'record', id: 'r1' })).toBe('record:r1');
		expect(formatSubject({ type: 'team', id: 't1', relation: 'member' })).toBe(
			'team:t1#member',
		);
	});
});

describe('parseTuple', () => {
	it('reads back what formatTuple wrote, both shapes', () => {
		expect(parseTuple(formatTuple(direct))).toEqual(direct);
		expect(parseTuple(formatTuple(inherited))).toEqual(inherited);
	});

	it('splits a type from its id at the first colon, so an id may hold one', () => {
		expect(parseSubject('staff:org:42')).toEqual({
			type: 'staff',
			id: 'org:42',
		});
	});

	it('refuses a string that is not a tuple, rather than half-parsing one', () => {
		expect(() => parseTuple('record:r1#viewer')).toThrow(TypeError);
		expect(() => parseTuple('')).toThrow(/is not a relation tuple/);
		expect(() => parseTuple('alice')).toThrow(/type:id#relation@subject/);
	});

	it('refuses Keto’s untyped subject, and says what a subject is', () => {
		expect(() => parseTuple('record:r1#viewer@alice')).toThrow(
			/expected type:id, or type:id#relation/,
		);
		expect(() => parseSubject('team:t1#member#extra')).toThrow(TypeError);
	});
});
