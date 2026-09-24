/**
 * The engine: `permissions({ model, store })`, the traversal behind `can()`,
 * and the same traversal run backwards behind `list()` — `walk.ts` and
 * `reverse.ts`; what a caller passes is read in `input.ts`.
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

import type { CursorPage } from '../pagination/cursor-page';
import { pageLimit } from '../pagination/cursor-page';
import { guardRelations } from '../stores/guard';
import { objectOf, subjectOf, tupleOf, typeOf } from './input';
import type { ModelConfig, PermissionModel, Permissions } from './model';
import { resolvedOf } from './model';
import type { RelationStore } from './port/types';
import { Reverse } from './reverse';
import { Walk } from './walk';

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
 * await access.grant({ type: 'team', id: 't1' }, 'member', staff);
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

	const check = async (
		subject: unknown,
		permission: string,
		object: unknown,
		options?: { readonly ctx?: unknown },
	): Promise<boolean> => {
		// Anonymous, before anything else — and before the store.
		if (subject === null || subject === undefined) return false;

		const root = objectOf(model, object, 'can');
		const type = typeOf(model, root.type, 'can');
		if (!type.relations.has(permission) && !type.permissions.has(permission)) {
			throw new TypeError(
				`can: "${permission}" is not a relation or a permission of ${type.name}`,
			);
		}

		return new Walk(
			model,
			store,
			maxDepth,
			options?.ctx,
			`${type.name}#${permission}`,
		).holds(
			subjectOf(model, subject, 'can'),
			{ entity: { type: root.type, id: root.id }, data: root.data },
			permission,
			0,
		);
	};

	const list = async (
		subject: unknown,
		permission: string,
		typeName: unknown,
		options?: {
			readonly ctx?: unknown;
			readonly after?: string | null;
			readonly limit?: number;
		},
	): Promise<CursorPage<string>> => {
		const limit = pageLimit(options?.limit, 'list');
		const after = options?.after ?? null;
		if (after !== null && typeof after !== 'string') {
			throw new TypeError(
				'list: after must be the nextCursor of a page, or null',
			);
		}
		// Anonymous holds nothing, and the store is not asked.
		if (subject === null || subject === undefined) {
			return { items: [], nextCursor: null };
		}

		if (typeof typeName !== 'string') {
			throw new TypeError('list: the type must be an object type of the model');
		}
		const type = typeOf(model, typeName, 'list');
		if (!type.relations.has(permission) && !type.permissions.has(permission)) {
			throw new TypeError(
				`list: "${permission}" is not a relation or a permission of ${type.name}`,
			);
		}

		const ids = await new Reverse(
			model,
			store,
			maxDepth,
			options?.ctx,
			subjectOf(model, subject, 'list'),
			`${type.name}#${permission}`,
		).objects(type.name, permission);

		const rest = [...ids].sort().filter((id) => after === null || id > after);
		const items = rest.slice(0, limit);
		const last = items.at(-1);
		return {
			items,
			nextCursor: rest.length > limit && last !== undefined ? last : null,
		};
	};

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
		can: check as Permissions<C>['can'],
		list: list as Permissions<C>['list'],
		grant: change('grant') as Permissions<C>['grant'],
		revoke: change('revoke') as Permissions<C>['revoke'],
	});
}
