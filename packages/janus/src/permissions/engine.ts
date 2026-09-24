/**
 * The engine: `permissions({ model, store })`, and the traversal behind
 * `can()`.
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

import { guardRelations } from '../auth/outage';
import { PermissionDepthError } from '../errors/janus-error';
import { formatEntity } from '../subjects/notation';
import type { Entity, Subject } from '../subjects/subject';
import type { ModelConfig, PermissionModel, Permissions } from './model';
import { resolvedOf } from './model';
import type { RelationStore } from './port/types';
import type {
	ResolvedModel,
	ResolvedObjectType,
	ResolvedRule,
} from './resolve';

/** Deep enough for any hierarchy a person draws; OpenFGA's default too. */
const DEFAULT_MAX_DEPTH = 25;

/** What no part of an id may hold: the notation would read it two ways. */
const RESERVED = /[@#()]/;

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
			formatEntity(root),
		).holds(
			subjectOf(model, subject, 'can'),
			{ entity: { type: root.type, id: root.id }, data: root.data },
			permission,
			0,
		);
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
		grant: change('grant') as Permissions<C>['grant'],
		revoke: change('revoke') as Permissions<C>['revoke'],
	});
}

/** An object on the walk: its entity, and its data when the caller passed it. */
interface Node {
	readonly entity: Entity;
	readonly data: Readonly<Record<string, unknown>> | null;
}

/** One check: its context, its path, and the depth it may reach. */
class Walk {
	/** The nodes on the current path. The walk is sequential, so one set is the stack. */
	private readonly path = new Set<string>();

	constructor(
		private readonly model: ResolvedModel,
		private readonly store: RelationStore,
		private readonly maxDepth: number,
		private readonly ctx: unknown,
		private readonly question: string,
	) {}

	/** Whether `subject` holds `name` — a relation or a permission — on `node`. */
	async holds(
		subject: Subject,
		node: Node,
		name: string,
		depth: number,
	): Promise<boolean> {
		if (depth > this.maxDepth) {
			throw new PermissionDepthError(
				`can: checking ${this.question} crossed more than ${this.maxDepth} relations without an answer`,
				{ permission: this.question, maxDepth: this.maxDepth },
			);
		}

		const key = `${formatEntity(node.entity)}#${name}`;
		// A cycle in the data: this branch grants nothing, and it is not an error.
		if (this.path.has(key)) return false;

		const type = this.model.types.get(node.entity.type);
		// A stored tuple naming a type the model no longer declares grants nothing.
		if (type === undefined) return false;

		this.path.add(key);
		try {
			return type.permissions.has(name)
				? await this.permission(subject, type, node, name, depth)
				: await this.relation(subject, type, node, name, depth);
		} finally {
			this.path.delete(key);
		}
	}

	private async relation(
		subject: Subject,
		type: ResolvedObjectType,
		node: Node,
		name: string,
		depth: number,
	): Promise<boolean> {
		const relation = type.relations.get(name);
		if (relation === undefined) return false;

		if (relation.kind === 'fromField') {
			const id = fieldOf(node, relation.field, `${type.name}.${name}`);
			return (
				id !== null &&
				!('relation' in subject) &&
				subject.type === relation.subject &&
				subject.id === id
			);
		}

		if (
			await this.store.has({ object: node.entity, relation: name, subject })
		) {
			return true;
		}
		for (const set of await this.store.findSubjectSets(node.entity, name)) {
			const through = { entity: { type: set.type, id: set.id }, data: null };
			if (await this.holds(subject, through, set.relation, depth + 1)) {
				return true;
			}
		}
		return false;
	}

	private async permission(
		subject: Subject,
		type: ResolvedObjectType,
		node: Node,
		name: string,
		depth: number,
	): Promise<boolean> {
		for (const rule of type.permissions.get(name) ?? []) {
			if (rule.test !== undefined && !this.passes(rule, type, name)) continue;

			if (rule.kind === 'name') {
				if (await this.holds(subject, node, rule.name, depth)) return true;
				continue;
			}
			for (const target of await this.targets(type, node, rule.relation)) {
				if (await this.holds(subject, target, rule.target, depth + 1)) {
					return true;
				}
			}
		}
		return false;
	}

	/** The condition, run on the caller's `ctx`. Its absence is a caller's bug, not a denial. */
	private passes(
		rule: ResolvedRule,
		type: ResolvedObjectType,
		name: string,
	): boolean {
		if (this.ctx === undefined) {
			throw new TypeError(
				`can: ${type.name}.${name} reaches a condition, and no ctx was passed — pass { ctx }`,
			);
		}
		return (rule.test as (ctx: unknown) => boolean)(this.ctx) === true;
	}

	/** The objects an arrow through `relation` reaches from `node`. */
	private async targets(
		type: ResolvedObjectType,
		node: Node,
		relation: string,
	): Promise<Node[]> {
		const through = type.relations.get(relation);
		if (through === undefined) return [];

		if (through.kind === 'fromField') {
			const id = fieldOf(node, through.field, `${type.name}.${relation}`);
			return id === null
				? []
				: [{ entity: { type: through.subject, id }, data: null }];
		}
		return (await this.store.findEntities(node.entity, relation)).map(
			(entity) => ({
				entity: { type: entity.type, id: entity.id },
				data: null,
			}),
		);
	}
}

/** The id a `fromField` reads, or `null` for nobody. A missing field is the caller's bug. */
function fieldOf(node: Node, field: string, what: string): string | null {
	if (node.data === null) {
		// resolveModel refuses a model that could get here.
		throw new TypeError(
			`can: ${what} reads ${field} from an object nobody passed`,
		);
	}
	const value = node.data[field];
	if (value === null) return null;
	if (typeof value !== 'string') {
		throw new TypeError(
			`can: ${what} reads ${field}, which the object ${value === undefined ? 'does not carry — pass the loaded object, spread' : 'holds as something other than a string id'}`,
		);
	}
	return value;
}

// ─── Reading what a caller passed ────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

function idOf(value: unknown, what: string, where: string): string {
	if (typeof value !== 'string' || value === '' || RESERVED.test(value)) {
		throw new TypeError(
			`${where}: ${what} must be a non-empty string without @, # or parentheses`,
		);
	}
	return value;
}

function typeOf(
	model: ResolvedModel,
	name: string,
	where: string,
): ResolvedObjectType {
	const type = model.types.get(name);
	if (type === undefined) {
		throw new TypeError(
			`${where}: "${name}" is not an object type of the model`,
		);
	}
	return type;
}

function objectOf(
	model: ResolvedModel,
	value: unknown,
	where: string,
): {
	readonly type: string;
	readonly id: string;
	readonly data: Readonly<Record<string, unknown>>;
} {
	if (!isRecord(value) || typeof value.type !== 'string') {
		throw new TypeError(
			`${where}: the object must be { type, id, …its fields }`,
		);
	}
	typeOf(model, value.type, where);
	return {
		type: value.type,
		id: idOf(value.id, 'the object id', where),
		data: value,
	};
}

/**
 * The subject as the store compares it: `{ type, id }` for a user or an
 * object, and `{ type, id, relation }` for a subject set.
 *
 * Decided by the type, not the shape: a user's fields are flat on it, and one
 * named `relation` must not make a user read as a set. A user type is never a
 * set; an object type is one when `relation` is given.
 */
function subjectOf(
	model: ResolvedModel,
	value: unknown,
	where: string,
): Subject {
	if (!isRecord(value) || typeof value.type !== 'string') {
		throw new TypeError(
			`${where}: the subject must be a user, or { type, id }`,
		);
	}
	const id = idOf(value.id, 'the subject id', where);
	if (model.subjects.has(value.type)) return { type: value.type, id };

	const type = typeOf(model, value.type, where);
	if (typeof value.relation !== 'string') return { type: type.name, id };
	if (!type.relations.has(value.relation)) {
		throw new TypeError(
			`${where}: "${value.relation}" is not a relation of ${type.name}, so ${type.name}:${id}#${value.relation} is no subject set`,
		);
	}
	return { type: type.name, id, relation: value.relation };
}

/** A tuple `grant` or `revoke` may write: a stored relation, and a holder it admits. */
function tupleOf(
	model: ResolvedModel,
	object: unknown,
	relation: string,
	subject: unknown,
	where: string,
) {
	const target = objectOf(model, object, where);
	const type = typeOf(model, target.type, where);
	const def = type.relations.get(relation);
	if (def === undefined) {
		throw new TypeError(
			`${where}: "${relation}" is not a relation of ${type.name}`,
		);
	}
	if (def.kind === 'fromField') {
		throw new TypeError(
			`${where}: ${type.name}.${relation} is read from ${def.field}; there is nothing to store — change the ${type.name} instead`,
		);
	}

	const who = subjectOf(model, subject, where);
	const admitted = def.holders.some((holder) =>
		holder.kind === 'type'
			? !('relation' in who) && holder.type === who.type
			: 'relation' in who &&
				holder.type === who.type &&
				holder.relation === who.relation,
	);
	if (!admitted) {
		throw new TypeError(
			`${where}: ${type.name}.${relation} is not held by ${'relation' in who ? `${who.type}#${who.relation}` : who.type}`,
		);
	}

	return {
		object: { type: target.type, id: target.id },
		relation,
		subject: who,
	};
}
