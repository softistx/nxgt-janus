/** The walk behind `can()`: from an object, through its rules, to a subject. */

import { PermissionDepthError } from '../errors/janus-error';
import { formatEntity } from '../subjects/notation';
import type { Entity, Subject } from '../subjects/subject';
import type { RelationStore } from './port/types';
import {
	admits,
	type ResolvedModel,
	type ResolvedObjectType,
	type ResolvedRule,
} from './resolve';

/** An object on the walk: its entity, and its data when the caller passed it. */
export interface Node {
	readonly entity: Entity;
	readonly data: Readonly<Record<string, unknown>> | null;
}

/** One check: its context, its path, and the depth it may reach. */
export class Walk {
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

		// What the model does not admit here grants nothing, however it was stored.
		if (
			admits(relation.holders, subject) &&
			(await this.store.has({ object: node.entity, relation: name, subject }))
		) {
			return true;
		}
		for (const set of await this.store.findSubjectSets(node.entity, name)) {
			if (!admits(relation.holders, set)) continue;
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
		// An entity of a type the model does not admit here is no target.
		return (await this.store.findEntities(node.entity, relation))
			.filter((entity) => admits(through.holders, entity))
			.map((entity) => ({
				entity: { type: entity.type, id: entity.id },
				data: null,
			}));
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
