import { describe, expect, it } from 'bun:test';
import type { PgDatabase } from '@nxgt/drizzle/pg';
import { mintId, type UserRecord } from '@nxgt/janus';
import { eq } from 'drizzle-orm';
import { pgSchema } from 'drizzle-orm/pg-core';
import { openTestDb } from '../test/db';
import { createDrizzleAdapter } from './adapter';
import { createDrizzleStores } from './stores';
import { defineJanusTables } from './tables';

const at = new Date('2026-01-01T00:00:00.000Z');

function user(logins: readonly string[]): UserRecord {
	return {
		id: mintId(),
		type: 'user',
		schemaVersion: '1',
		active: true,
		fields: {},
		logins,
		password: null,
		secondFactor: null,
		emailVerifiedAt: null,
		version: 0,
		createdAt: at,
		updatedAt: at,
	};
}

describe('createDrizzleStores(), beyond the port suite', () => {
	it('never deadlocks two sign-ups claiming one set of logins in opposite orders', async () => {
		// Meaningful on a real server (JANUS_POSTGRES_URL): PGlite runs one
		// connection, so nothing there is concurrent. Measured before the
		// claim sorted its logins: 122 of 800 inserts deadlocked, `40P01`.
		const test = await openTestDb();
		try {
			const { users } = createDrizzleStores(test.db);
			const logins = ['a', 'b', 'c', 'd', 'e', 'f'].map((l) => `${l}@x.test`);
			const outcomes: string[] = [];
			for (let round = 0; round < 20; round += 1) {
				const claimed = logins.map((login) => `${round}-${login}`);
				const settled = await Promise.allSettled(
					[0, 1, 2, 3].map((n) =>
						users.insertUser(
							user(n % 2 === 0 ? claimed : [...claimed].reverse()),
						),
					),
				);
				for (const outcome of settled) {
					outcomes.push(
						outcome.status === 'fulfilled'
							? 'inserted'
							: String((outcome.reason as { code?: unknown }).code),
					);
				}
			}

			expect(outcomes.filter((o) => o === 'inserted')).toHaveLength(20);
			expect(new Set(outcomes)).toEqual(new Set(['inserted', 'LOGIN_TAKEN']));
		} finally {
			await test.close();
		}
	});

	it('answers NOT_FOUND to a retried insert whose user was deleted meanwhile', async () => {
		const test = await openTestDb();
		try {
			const record = user(['ada@x.test']);
			await createDrizzleStores(test.db).users.insertUser(record);

			// The retry's transaction finds the id taken, then the user goes
			// before the retry reads it back.
			const racing = new Proxy(test.db, {
				get(target, key, receiver) {
					const value: unknown = Reflect.get(target, key, receiver);
					if (key !== 'transaction' || typeof value !== 'function') {
						return value;
					}
					return async (...args: unknown[]) => {
						const answer: unknown = await value.apply(target, args);
						const { users } = defineJanusTables();
						await target.delete(users).where(eq(users.id, record.id));
						return answer;
					};
				},
			}) as PgDatabase;

			const outcome = await createDrizzleStores(racing)
				.users.insertUser(record)
				.then(
					() => 'resolved',
					(error: { code?: string }) => error.code,
				);
			expect(outcome).toBe('NOT_FOUND');
		} finally {
			await test.close();
		}
	});
});

describe('createDrizzleAdapter(db, { tables }), in a schema of their own', () => {
	it("never touches the application's own tables of the same names", async () => {
		const janus = pgSchema('janus');
		const test = await openTestDb({ schema: janus });
		try {
			// The application's own `users`, `sessions`, `tokens` and
			// `relations` in `public`, refusing every write — even of no row.
			await test.exec(`
				create function decoy() returns trigger language plpgsql as
					$$ begin raise exception 'decoy touched'; end $$;
			`);
			for (const table of [
				'users',
				'logins',
				'sessions',
				'tokens',
				'relations',
			]) {
				await test.exec(`
					create table public.${table} (id text primary key);
					create trigger decoy before insert or update or delete
						on public.${table} for each statement execute function decoy();
				`);
			}

			const { store, relations } = createDrizzleAdapter(test.db, {
				tables: defineJanusTables({ schema: janus }),
			});
			const record = user(['ada@x.test']);
			await store.users.insertUser(record);
			expect(await store.users.findUser(record.id)).toEqual(record);
			const tuple = {
				object: { type: 'record', id: 'r1' },
				relation: 'owners',
				subject: { type: 'user', id: record.id },
			};
			await relations.write({ add: [tuple] });
			expect(await relations.has(tuple)).toBe(true);
			expect(await store.sessions.deleteUserSessions(record.id)).toBe(0);
			expect(await store.tokens.deleteUserTokens(record.id)).toBe(0);
			await relations.deleteEntity({ type: 'user', id: record.id });
			expect(await store.users.deleteUser(record.id)).toBe(true);
		} finally {
			await test.close();
		}
	});
});
