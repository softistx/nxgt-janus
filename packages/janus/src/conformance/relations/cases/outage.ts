import { JanusError, StoreFailure } from '../../../errors/janus-error';
import type { RelationStore } from '../../../permissions/port/types';
import type { Entity } from '../../../subjects/subject';
import { equal, isOurs, ok, rejects } from '../../assert';
import { tuple } from '../fixtures';
import type { RelationCase, RelationMethod } from '../types';

/**
 * For each method, a store that cannot answer must **reject** — never
 * `false`, `[]`, an empty page or `0`. A relation store that answers `false`
 * for an outage denies everybody everything and says nothing; one that
 * resolves a write it did not make leaves a revoked access standing.
 */
function outage(
	method: RelationMethod,
	call: (store: RelationStore) => Promise<unknown>,
	after?: (store: RelationStore) => Promise<void>,
): RelationCase {
	return {
		id: `outage.${method}`,
		group: 'outage',
		name: `relations.${method} rejects when the store cannot answer — never false, [], an empty page or 0`,
		needs: 'faults',
		async run({ store, faults }) {
			await store.write({ add: [seeded] });
			await faults?.fail(method);

			const error = await rejects(
				call(store),
				`relations.${method} under an outage should reject`,
			);
			if (
				error instanceof JanusError ||
				(error as { name?: unknown })?.name === 'StoreFailure'
			) {
				isOurs(
					error,
					StoreFailure,
					'StoreFailure',
					`relations.${method} under an outage`,
				);
			}
			ok(
				(error as { code?: unknown } | null)?.code !== 'NOT_FOUND',
				`relations.${method} under an outage rejected with NOT_FOUND: an outage is never an absence`,
			);
			await after?.(store);
		},
	};
}

const seededObject: Entity = { type: 'record', id: 'seeded' };
const seededSubject: Entity = { type: 'staff', id: 'seeded' };
const seeded = tuple(seededObject, 'viewer', seededSubject);

export const relationOutageCases: readonly RelationCase[] = [
	outage(
		'write',
		(store) =>
			store.write({
				remove: [seeded],
				add: [tuple(seededObject, 'owner', seededSubject)],
			}),
		// A rejected write is one that did nothing: all of it, or none of it.
		async (store) => {
			equal(
				await store.has(seeded),
				true,
				'relations.write rejected, and still removed a tuple: a write is all or nothing',
			);
			equal(
				await store.has(tuple(seededObject, 'owner', seededSubject)),
				false,
				'relations.write rejected, and still added a tuple: a write is all or nothing',
			);
		},
	),
	outage('has', (store) => store.has(seeded)),
	outage('findSubjectSets', (store) =>
		store.findSubjectSets(seededObject, 'viewer'),
	),
	outage('findEntities', (store) => store.findEntities(seededObject, 'viewer')),
	outage('findObjects', (store) =>
		store.findObjects({
			type: 'record',
			relation: 'viewer',
			subject: seededSubject,
			after: null,
			limit: 10,
		}),
	),
	outage('deleteEntity', (store) => store.deleteEntity(seededSubject)),
];
