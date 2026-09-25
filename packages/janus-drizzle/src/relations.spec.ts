import { describe, expect, it } from 'bun:test';
import { openTestDb } from '../test/db';
import { createDrizzleRelations } from './relations';

describe('createDrizzleRelations(), beyond the port suite', () => {
	it('writes all or nothing: a failed addition rolls its removal back', async () => {
		const test = await openTestDb();
		try {
			const store = createDrizzleRelations(test.db);
			const object = { type: 'record', id: 'r1' };
			const before = {
				object,
				relation: 'owner',
				subject: { type: 'staff', id: 'a' },
			};
			const after = { ...before, subject: { type: 'staff', id: 'b' } };
			await store.write({ add: [before] });

			// Only the addition fails: a trigger refuses the insert, after the
			// removal ran inside the transaction.
			await test.exec(`
				create function refuse() returns trigger language plpgsql as
					$$ begin raise exception 'refused'; end $$;
				create trigger refuse before insert on janus_relations
					for each statement execute function refuse();
			`);
			const outcome = await store
				.write({ remove: [before], add: [after] })
				.then(
					() => 'resolved',
					(error: { code?: string }) => error.code,
				);

			expect(outcome).toBe('STORE_FAILED');
			expect(await store.has(before)).toBe(true);
			expect(await store.has(after)).toBe(false);
		} finally {
			await test.close();
		}
	});

	it('pages object ids in byte order, whatever the database collation', async () => {
		// Under `en-US` — the collation JANUS_POSTGRES_URL's databases are
		// created with — `a` sorts before `B`. In bytes, `B` comes first.
		const test = await openTestDb();
		try {
			const store = createDrizzleRelations(test.db);
			const subject = { type: 'staff', id: 'u1' };
			const ids = ['a', 'B', 'c', '_x', 'Z', 'b'];
			await store.write({
				add: ids.map((id) => ({
					object: { type: 'record', id },
					relation: 'owner',
					subject,
				})),
			});

			const seen: string[] = [];
			let after: string | null = null;
			do {
				const page: { items: readonly string[]; nextCursor: string | null } =
					await store.findObjects({
						type: 'record',
						relation: 'owner',
						subject,
						after,
						limit: 2,
					});
				seen.push(...page.items);
				after = page.nextCursor;
			} while (after !== null);

			expect(seen).toEqual(['B', 'Z', '_x', 'a', 'b', 'c']);
		} finally {
			await test.close();
		}
	});
});
