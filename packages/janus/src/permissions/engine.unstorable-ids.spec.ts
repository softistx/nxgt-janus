import { describe, expect, it } from 'bun:test';
import { rejection } from '../../test/rejection';
import {
	offShift,
	record,
	setup,
	staff,
	team,
	untouchable,
} from './engine.fixtures';

describe('an id no store can keep', () => {
	// PostgreSQL refuses a NUL, and a lone surrogate in jsonb; a URL param
	// `%00` is enough to send one. Answered the same on every adapter.
	const unstorable = ['a\u0000b', 'a\uD800b', '\uDFFF'];

	it('is held by nobody: can answers false, and no store is asked', async () => {
		const access = setup(untouchable());
		for (const id of unstorable) {
			expect(
				await access.can({ type: 'staff', id }, 'view', record(), offShift),
			).toBe(false);
			expect(
				await access.can(staff(), 'view', { ...record(), id }, offShift),
			).toBe(false);
		}
	});

	it('names no subject set: can and list answer as for an entity', async () => {
		const access = setup(untouchable());
		const members = {
			type: 'team',
			id: 't\u0000',
			relation: 'members',
		} as const;
		expect(await access.can(members, 'view', record(), offShift)).toBe(false);
		expect(await access.list(members, 'view', 'team')).toEqual({
			items: [],
			nextCursor: null,
		});
	});

	it('holds nothing: list answers an empty page, and no store is asked', async () => {
		const access = setup(untouchable());
		for (const id of unstorable) {
			expect(await access.list({ type: 'staff', id }, 'view', 'team')).toEqual({
				items: [],
				nextCursor: null,
			});
		}
	});

	it('is a TypeError from grant and revoke, before a store is asked', async () => {
		const access = setup(untouchable());
		for (const operation of ['grant', 'revoke'] as const) {
			const object = await rejection(
				access[operation]({ ...record(), id: 'r\u0000' }, 'viewers', staff()),
			);
			expect(object).toBeInstanceOf(TypeError);
			expect((object as TypeError).message).toBe(
				`${operation}: the object id holds a NUL character or a lone surrogate, which no store can keep`,
			);
			const subject = await rejection(
				access[operation](record(), 'viewers', { type: 'staff', id: '\uD800' }),
			);
			expect(subject).toBeInstanceOf(TypeError);
			expect((subject as TypeError).message).toBe(
				`${operation}: the subject id holds a NUL character or a lone surrogate, which no store can keep`,
			);
		}
	});

	it('still refuses what is wrong with the question itself first', async () => {
		const access = setup(untouchable());
		expect(() =>
			access.can({ type: 'staff', id: 'a\u0000' }, 'nope' as 'view', team()),
		).toThrow('can: "nope" is not a relation or a permission of team');
	});
});
