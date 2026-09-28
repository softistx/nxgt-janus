/**
 * One `@permission`, asked at request time: the objects its `id:` names, each
 * checked with the request's check — memoized per request — and a denial
 * unless every one holds. A failure to answer is never a denial.
 */

import type { Check } from '../../context';
import { denial, rethrown } from '../../errors';
import { type Target, targetsOf } from './path';
import type { PermissionCheck } from './validate';

type ObjectLike = { readonly type: string; readonly id: string };
type Subject = { readonly type: string; readonly id: string };

/** What the guard has in hand when it asks. */
export interface Asking {
	readonly check: Check;
	readonly user: Subject;
	readonly parent: unknown;
	readonly args: unknown;
	/** The GraphQL context, which `loaders` and `conditions` receive. */
	readonly ctx: unknown;
}

/** Refuses the request unless `user` holds `permission` on every object its `id:` names. */
export async function enforcePermission(
	permission: PermissionCheck,
	asking: Asking,
): Promise<void> {
	const targets = targetsOf(permission.path, asking.parent, asking.args);
	if (targets === null) {
		warnNoId(permission);
		throw denial('NOT_FOUND');
	}
	const objects = await Promise.all(
		targets.map((target) => objectOf(permission, target, asking.ctx)),
	).then(undefined, rethrown);
	const found = objects.filter(
		(object): object is ObjectLike => object !== null,
	);
	if (found.length < objects.length) throw denial('NOT_FOUND');
	const answers = await Promise.all(
		found.map((object) => ask(permission, object, asking)),
	).then(undefined, rethrown);
	if (answers.includes(false)) throw denial(permission.onDeny);
}

async function ask(
	permission: PermissionCheck,
	object: ObjectLike,
	{ check, user, ctx }: Asking,
): Promise<boolean> {
	const options =
		permission.condition === null
			? undefined
			: { ctx: await permission.condition(object, ctx) };
	return check(user, permission.name, object, options);
}

/**
 * What no object id can hold, as `@nxgt/janus` reads the notation: `can()`
 * refuses such an id with a `TypeError`, and one sent by a client is no
 * object's. A copy of the core's `RESERVED`, recorded in AGENTS.md's
 * *Deliberate duplications*.
 */
const UNNAMEABLE = /^$|[@#()]/;

/**
 * Whether an id sent by a client can name an object: none of the characters
 * above, no NUL and no lone surrogate — which no store keeps, so `can()`
 * holds them for nobody, and the application's loader must never see them.
 * A copy of the core's `isStorable`, recorded beside `UNNAMEABLE`.
 */
const isNameable = (id: string): boolean =>
	!UNNAMEABLE.test(id) && !id.includes('\u0000') && id.isWellFormed();

/**
 * The object `can()` is given for one target: the value that holds the id,
 * the loader's answer, or `{ type, id }`. `null` when there is none: the
 * loader found none, or the id could name no object.
 */
async function objectOf(
	permission: PermissionCheck,
	{ id, holder }: Target,
	ctx: unknown,
): Promise<ObjectLike | null> {
	const { type, load } = permission;
	if (!isNameable(id)) return null;
	if (holder !== null) return view(holder, type, id);
	if (load === null) return { type, id };
	const loaded = await load(id, ctx);
	if (loaded === null) return null;
	if (typeof loaded !== 'object') {
		throw new TypeError(
			`${permission.label}: loaders.${type} answered ${typeof loaded} — answer the object, or null when there is none`,
		);
	}
	return view(loaded, type, id);
}

/**
 * The object as `can()` reads it: `type` added — and `id`, the string read
 * from the path, so an integer id reads as graphql-js serialises it — every
 * other field read from the object itself, so a getter, a
 * class's `#private` state or an ORM document's accessors answer as they do
 * in the resolver. A spread would copy own enumerable fields only. The
 * proxy's target is an empty object rather than `object`, so a frozen
 * object whose own `type` means something else is read without breaking a
 * proxy invariant.
 */
function view(object: object, type: string, id: string): ObjectLike {
	return new Proxy(Object.create(null) as object, {
		get: (_, key) =>
			key === 'type' ? type : key === 'id' ? id : Reflect.get(object, key),
		has: (_, key) => key === 'type' || Reflect.has(object, key),
	}) as ObjectLike;
}

const warned = new WeakSet<PermissionCheck>();

/** Says once per directive, on the only channel a library has, why a field answers `NOT_FOUND`. */
function warnNoId(permission: PermissionCheck): void {
	if (warned.has(permission)) return;
	warned.add(permission);
	process.emitWarning(
		`${permission.label} resolved no object id from ${permission.path.text} — answered NOT_FOUND`,
		{ code: 'JANUS_GRAPHQL_NO_OBJECT_ID' },
	);
}
