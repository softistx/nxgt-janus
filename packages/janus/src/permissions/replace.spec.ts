import { describe, expect, it } from 'bun:test';
import { rejection } from '../../test/rejection';
import { staff, team } from './engine.fixtures';
import { counting } from './replace.fixtures';

describe('replace', () => {
	it('adds the missing holders and removes the extra ones', async () => {
		const { access } = counting();
		const t = team();
		const [ada, bob, cy] = [staff(), staff(), staff()];
		await access.grant(t, 'members', ada);
		await access.grant(t, 'members', bob);

		const counts = await access.replace(t, 'members', [bob, cy]);

		expect(counts).toEqual({ added: 1, removed: 1 });
		expect(await access.can(ada, 'members', t)).toBe(false);
		expect(await access.can(bob, 'members', t)).toBe(true);
		expect(await access.can(cy, 'members', t)).toBe(true);
	});

	it('writes once, removals and additions together', async () => {
		const { access, writes } = counting();
		const t = team();
		const [ada, bob] = [staff(), staff()];
		await access.grant(t, 'members', ada);
		writes.length = 0;

		await access.replace(t, 'members', [bob]);

		expect(writes).toHaveLength(1);
		expect(writes[0]?.add).toHaveLength(1);
		expect(writes[0]?.remove).toHaveLength(1);
	});

	it('leaves untouched holders alone and does not write when nothing changes', async () => {
		const { access, writes } = counting();
		const t = team();
		const [ada, bob] = [staff(), staff()];
		await access.grant(t, 'members', ada);
		await access.grant(t, 'members', bob);
		writes.length = 0;

		const counts = await access.replace(t, 'members', [bob, ada]);

		expect(counts).toEqual({ added: 0, removed: 0 });
		expect(writes).toHaveLength(0);
	});

	it('only adds, or only removes, in a write of its own kind', async () => {
		const { access, writes } = counting();
		const t = team();
		const [ada, bob] = [staff(), staff()];
		await access.replace(t, 'members', [ada, bob]);
		await access.replace(t, 'members', [ada]);

		expect(writes[0]?.remove).toEqual([]);
		expect(writes[0]?.add).toHaveLength(2);
		expect(writes[1]?.add).toEqual([]);
		expect(writes[1]?.remove).toHaveLength(1);
	});

	it('removes every holder from an empty list', async () => {
		const { access } = counting();
		const t = team();
		const [ada, bob] = [staff(), staff()];
		await access.grant(t, 'members', ada);
		await access.grant(t, 'members', bob);
		await access.grant(t, 'members', {
			type: 'team',
			id: 't2',
			relation: 'members',
		});

		expect(await access.replace(t, 'members', [])).toEqual({
			added: 0,
			removed: 3,
		});
		expect(await access.can(ada, 'members', t)).toBe(false);
		expect(await access.can(bob, 'members', t)).toBe(false);
	});

	it('refuses a wrong relation even for an empty list', async () => {
		const { access, writes } = counting();
		const error = await rejection(access.replace(team(), 'nope' as never, []));

		expect((error as Error).message).toContain(
			'"nope" is not a relation of team',
		);
		expect(writes).toHaveLength(0);
	});

	it('keeps a subject set and its entity apart', async () => {
		const { access, writes } = counting();
		const t = team();
		const other = team();
		const set = {
			type: 'team' as const,
			id: other.id,
			relation: 'members' as const,
		};
		const sameId = { type: 'staff' as const, id: other.id };
		await access.grant(t, 'members', sameId);
		writes.length = 0;

		expect(await access.replace(t, 'members', [set])).toEqual({
			added: 1,
			removed: 1,
		});
		expect(await access.can(sameId, 'members', t)).toBe(false);

		expect(await access.replace(t, 'members', [set, sameId])).toEqual({
			added: 1,
			removed: 0,
		});
		expect(await access.replace(t, 'members', [set, sameId])).toEqual({
			added: 0,
			removed: 0,
		});
	});

	it('counts a duplicate once', async () => {
		const { access, writes } = counting();
		const t = team();
		const ada = staff();

		const counts = await access.replace(t, 'members', [ada, ada, { ...ada }]);

		expect(counts).toEqual({ added: 1, removed: 0 });
		expect(writes[0]?.add).toHaveLength(1);
	});

	it('reads a user as a user, whatever fields it carries', async () => {
		const { access } = counting();
		const t = team();
		const ada = staff();

		expect(
			await access.replace(t, 'members', [{ ...ada, relation: 'x' } as never]),
		).toEqual({ added: 1, removed: 0 });
		expect(await access.can(ada, 'members', t)).toBe(true);
	});

	it('touches no other relation and no other object', async () => {
		const { access } = counting();
		const t = team();
		const elsewhere = team();
		const [ada, bob] = [staff(), staff()];
		await access.grant(t, 'leads', ada);
		await access.grant(elsewhere, 'members', ada);
		await access.grant(t, 'members', ada);

		await access.replace(t, 'members', [bob]);

		expect(await access.can(ada, 'leads', t)).toBe(true);
		expect(await access.can(ada, 'members', elsewhere)).toBe(true);
		expect(await access.can(ada, 'members', t)).toBe(false);
	});
});
