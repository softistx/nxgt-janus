import { PermissionDepthError } from '../errors/janus-error';
import type { CursorPage } from '../pagination/cursor-page';
import { MAX_PAGE_SIZE } from '../pagination/cursor-page';
import type { Subject } from '../subjects/subject';
import type { RelationStore } from './port/types';
import type {
	ResolvedModel,
	ResolvedObjectType,
	ResolvedRule,
} from './resolve';

/**
 * One `list()`: the objects a subject holds a name on, found backwards —
 * from the subject to the tuples naming it, through the sets and arrows the
 * model declares, to the objects.
 *
 * **A least fixpoint.** `objects(type, name)` is a union of what its rules
 * reach, and a rule can reach its own name again — a folder viewable through
 * its parent, a team member through a team. Such a name, met again on the
 * current path, answers what the previous round found; rounds repeat until
 * none adds an id. That is exactly the set of objects with a derivation that
 * does not loop — what `can()`'s cut finds, one object at a time. A round
 * that met no loop is final.
 *
 * **Depth.** Each round past the first follows the loops one relation
 * further; more than `maxDepth` rounds is `PERMISSION_DEPTH`, as crossing more
 * than `maxDepth` relations is for `can()`.
 *
 * **Cost.** Every page of `findObjects` for every id each step reaches, every
 * round. Linear in what the subject can reach — fine for the objects of one
 * user, not for a subject set holding most of the database.
 */
export class Reverse {
	private previous = new Map<string, ReadonlySet<string>>();
	private current = new Map<string, ReadonlySet<string>>();
	private readonly path = new Set<string>();
	private looped = false;

	constructor(
		private readonly model: ResolvedModel,
		private readonly store: RelationStore,
		private readonly maxDepth: number,
		private readonly ctx: unknown,
		private readonly subject: Subject,
		private readonly question: string,
	) {}

	async objects(type: string, name: string): Promise<ReadonlySet<string>> {
		for (let round = 0; round <= this.maxDepth; round += 1) {
			this.current = new Map();
			this.looped = false;
			const found = await this.reach(type, name);
			if (!this.looped || this.same()) return found;
			this.previous = this.current;
		}
		throw new PermissionDepthError(
			`list: listing ${this.question} crossed more than ${this.maxDepth} relations without an answer`,
			{ permission: this.question, maxDepth: this.maxDepth },
		);
	}

	/** Whether this round found what the previous one did: nothing more to find. */
	private same(): boolean {
		for (const [key, ids] of this.current) {
			if ((this.previous.get(key)?.size ?? 0) !== ids.size) return false;
		}
		return true;
	}

	/** The ids of the objects of `typeName` on which the subject holds `name`. */
	private async reach(
		typeName: string,
		name: string,
	): Promise<ReadonlySet<string>> {
		const key = `${typeName}#${name}`;
		const done = this.current.get(key);
		if (done !== undefined) return done;
		if (this.path.has(key)) {
			this.looped = true;
			return this.previous.get(key) ?? new Set();
		}

		const type = this.model.types.get(typeName);
		if (type === undefined) return new Set();

		this.path.add(key);
		try {
			const found = type.permissions.has(name)
				? await this.permission(type, name)
				: await this.relation(type, name);
			this.current.set(key, found);
			return found;
		} finally {
			this.path.delete(key);
		}
	}

	private async relation(
		type: ResolvedObjectType,
		name: string,
	): Promise<Set<string>> {
		const relation = type.relations.get(name);
		if (relation === undefined) return new Set();

		if (relation.kind === 'fromField') {
			const subject = this.subject;
			return 'relation' in subject || subject.type !== relation.subject
				? new Set()
				: new Set(await this.lookup(type, name, subject.id));
		}

		const found = new Set(await this.holding(type.name, name, this.subject));
		for (const holder of relation.holders) {
			if (holder.kind !== 'set') continue;
			for (const id of await this.reach(holder.type, holder.relation)) {
				const set = { type: holder.type, id, relation: holder.relation };
				for (const object of await this.holding(type.name, name, set)) {
					found.add(object);
				}
			}
		}
		return found;
	}

	private async permission(
		type: ResolvedObjectType,
		name: string,
	): Promise<Set<string>> {
		const found = new Set<string>();
		for (const rule of type.permissions.get(name) ?? []) {
			if (rule.test !== undefined && !this.passes(rule, type, name)) continue;

			if (rule.kind === 'name') {
				for (const id of await this.reach(type.name, rule.name)) found.add(id);
				continue;
			}
			for (const id of await this.arrow(type, rule.relation, rule.target)) {
				found.add(id);
			}
		}
		return found;
	}

	/** The objects of `type` whose `relation` reaches an object on which the subject holds `target`. */
	private async arrow(
		type: ResolvedObjectType,
		relation: string,
		target: string,
	): Promise<Set<string>> {
		const through = type.relations.get(relation);
		const found = new Set<string>();
		if (through === undefined) return found;

		if (through.kind === 'fromField') {
			for (const id of await this.reach(through.subject, target)) {
				for (const object of await this.lookup(type, relation, id)) {
					found.add(object);
				}
			}
			return found;
		}
		for (const holder of through.holders) {
			// An arrow follows entities; a user type holds no permission.
			if (holder.kind !== 'type' || !this.model.types.has(holder.type)) {
				continue;
			}
			for (const id of await this.reach(holder.type, target)) {
				const entity = { type: holder.type, id };
				for (const object of await this.holding(type.name, relation, entity)) {
					found.add(object);
				}
			}
		}
		return found;
	}

	/** Every id of every page of `findObjects`. */
	private async holding(
		type: string,
		relation: string,
		subject: Subject,
	): Promise<string[]> {
		const ids: string[] = [];
		let after: string | null = null;
		do {
			const page: CursorPage<string> = await this.store.findObjects({
				type,
				relation,
				subject,
				after,
				limit: MAX_PAGE_SIZE,
			});
			ids.push(...page.items);
			after = page.nextCursor;
		} while (after !== null);
		return ids;
	}

	/** The objects whose field names `id`, from the `fromField`'s lookup. */
	private async lookup(
		type: ResolvedObjectType,
		relation: string,
		id: string,
	): Promise<readonly string[]> {
		const def = type.relations.get(relation);
		if (def?.kind !== 'fromField' || def.lookup === undefined) {
			throw new TypeError(
				`list: ${type.name}.${relation} is read from a field, and has no lookup to find the ${type.name}s naming ${id} — fromField('${def?.kind === 'fromField' ? def.field : relation}', '${def?.kind === 'fromField' ? def.subject : ''}', { lookup })`,
			);
		}
		const ids = await def.lookup(id);
		if (!Array.isArray(ids) || ids.some((each) => typeof each !== 'string')) {
			throw new TypeError(
				`list: the lookup of ${type.name}.${relation} must answer an array of ids`,
			);
		}
		return ids;
	}

	/** The condition, run on the caller's `ctx`, as for `can()`. */
	private passes(
		rule: ResolvedRule,
		type: ResolvedObjectType,
		name: string,
	): boolean {
		if (this.ctx === undefined) {
			throw new TypeError(
				`list: ${type.name}.${name} reaches a condition, and no ctx was passed — pass { ctx }`,
			);
		}
		return (rule.test as (ctx: unknown) => boolean)(this.ctx) === true;
	}
}
