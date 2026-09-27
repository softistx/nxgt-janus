/**
 * The engine: `permissions({ model, store })`, the traversal behind `can()`,
 * and the same traversal run backwards behind `list()` — `can.ts` over
 * `walk.ts`, `list.ts` over `reverse.ts`; what a caller passes is read in
 * `input.ts`.
 *
 * **The invariant, permission side.** A denial is `false` — never a thrown
 * error, which is how Keto's historical endpoint answers and why a denial and
 * an outage look alike there. A failure throws — never `false`, which would
 * deny everybody everything during an outage and say nothing. The store is
 * reached only through `guardRelations`, and `outage.spec.ts` refuses a `catch`
 * anywhere in this directory.
 *
 * **What is walked.** A relation holds when the tuple is stored, or through a
 * subject set holding it (`team:t1#member`), or — for a `fromField` — when the
 * object's field names the subject. A permission holds when any of its rules
 * does: a name of the same object, an arrow to a related object's permission,
 * either under a condition. The walk is sequential and stops at the first
 * grant, so a check reads no more than it needs.
 *
 * **Cycles and depth.** A node already on the current path — a team member of
 * a team member of itself — is cut: that branch grants nothing, and it is not
 * an error, because it is data. Crossing more than `maxDepth` relations *is*
 * an error, `PERMISSION_DEPTH`: an evaluation that stopped half-way decided
 * nothing, and `false` would hide it.
 */

import { guardRelations } from '../stores/guard';
import type { Bound } from './bound';
import { can } from './can';
import { tupleOf } from './input';
import { list } from './list';
import type { ModelConfig } from './model/config';
import { type PermissionModel, resolvedOf } from './model/define';
import type { Permissions } from './model/permissions';
import type { RelationStore } from './port/types';

/** Deep enough for any hierarchy a person draws; OpenFGA's default too. */
const DEFAULT_MAX_DEPTH = 25;

const REQUIRED = [
	'write',
	'has',
	'findSubjectSets',
	'findEntities',
	'findObjects',
	'deleteEntity',
] as const;

export interface PermissionsOptions<C extends ModelConfig> {
	/** What `defineModel()` answered. */
	readonly model: PermissionModel<C>;
	/** Where tuples live. `createMemoryRelations()` in tests. */
	readonly store: RelationStore;
	/** How many relations a check may cross. `25` when absent. */
	readonly maxDepth?: number;
}

/**
 * Binds a model to a relation store. Connects to nothing.
 *
 * ```ts
 * const access = permissions({ model, store: createMemoryRelations() });
 * await access.grant({ type: 'team', id: 't1' }, 'members', staff);
 * await access.can(staff, 'view', { type: 'record', ...record }, { ctx: { onShift } });
 * ```
 */
export function permissions<C extends ModelConfig>(
	options: PermissionsOptions<C>,
): Permissions<C> {
	const where = 'permissions';
	const model = resolvedOf(options.model);
	const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
	if (!Number.isInteger(maxDepth) || maxDepth < 1) {
		throw new TypeError(`${where}: maxDepth must be a positive integer`);
	}
	const raw = options.store as unknown as Record<string, unknown> | undefined;
	for (const method of REQUIRED) {
		if (typeof raw?.[method] !== 'function') {
			throw new TypeError(`${where}: store.${method} is missing`);
		}
	}
	const store = guardRelations(options.store);

	const bound: Bound = { model, store, maxDepth };
	// `can` and `list` over what this call bound, as the API takes them.
	const over =
		<A extends unknown[], R>(call: (bound: Bound, ...rest: A) => R) =>
		(...rest: A): R =>
			call(bound, ...rest);

	const change =
		(operation: 'grant' | 'revoke') =>
		async (object: unknown, relation: string, subject: unknown) => {
			const tuple = tupleOf(model, object, relation, subject, operation);
			await store.write(
				operation === 'grant' ? { add: [tuple] } : { remove: [tuple] },
			);
		};

	return Object.freeze({
		model: options.model,
		can: over(can) as Permissions<C>['can'],
		list: over(list) as Permissions<C>['list'],
		grant: change('grant') as Permissions<C>['grant'],
		revoke: change('revoke') as Permissions<C>['revoke'],
	});
}
