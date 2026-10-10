import { describe, expect, it } from 'bun:test';
import type { PgDatabase } from '@nxgt/drizzle/pg';
import { janus, mintId, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { openTestDb } from '../../test/db';
import { createDrizzleStores } from './index';

/** The database, counting every `select` a store starts on it. */
function counting(db: PgDatabase): { db: PgDatabase; selects: () => number } {
	let selects = 0;
	const counted = new Proxy(db, {
		get(target, key, receiver) {
			const value: unknown = Reflect.get(target, key, receiver);
			if (key !== 'select' || typeof value !== 'function') return value;
			return (...args: unknown[]) => {
				selects += 1;
				return value.apply(target, args);
			};
		},
	});
	return { db: counted, selects: () => selects };
}

describe('findMany over createDrizzleStores()', () => {
	it('reads a type’s users in one statement, in the order asked, each once, others left out', async () => {
		const test = await openTestDb();
		try {
			const { db, selects } = counting(test.db);
			const auth = janus({
				users: {
					patient: {
						schema: z.strictObject({ email: z.email() }),
						password: { login: 'email' },
					},
					staff: {
						schema: z.strictObject({ username: z.string() }),
						password: { login: 'username' },
					},
				},
				store: createDrizzleStores(db),
				hasher: scryptHasher({ cost: 10 }),
			});
			const [a, b, c] = await Promise.all(
				['a', 'b', 'c'].map((n) =>
					auth.patient.create({ email: `${n}@example.test` }),
				),
			);
			const staff = await auth.staff.create({ username: 'grace' });
			if (a === undefined || b === undefined || c === undefined) {
				throw new Error('three patients');
			}
			const before = selects();

			const found = await auth.patient.findMany([
				c.id,
				mintId(),
				staff.id,
				a.id,
				c.id,
				b.id,
			]);

			expect(found.map((user) => user.id)).toEqual([c.id, a.id, b.id]);
			expect(found[1]).toEqual(a);
			expect(selects() - before).toBe(1);
		} finally {
			await test.close();
		}
	});
});
