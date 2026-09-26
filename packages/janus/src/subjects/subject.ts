/**
 * The id every decision in this package hangs on: a user's `id`, as `janus()`
 * mints it.
 *
 * In Ory, the equality between a Kratos identity id and Keto's `subject_id` is
 * a comment and a convention, restated in three repositories and enforced
 * nowhere. Here a user **is** a subject — see {@link subjectOf} — and that
 * shared vocabulary is the whole reason users and permissions are one package
 * rather than two: two packages would make this contract implicit, and an
 * implicit contract between independently versioned packages breaks silently.
 *
 * Opaque: compared with `===`, carried in a URL, logged, never parsed.
 */
export type SubjectId = string;

/**
 * Something a permission is about or held by — a user, a record, a team — by
 * its type and its id.
 *
 * **Typed, unlike Keto's subjects.** One application has patients and staff,
 * and an object can hold a relation too (a record's team), so an id alone does
 * not say who. `type` is a user type of `janus()` or an object type of the
 * permission model, and the same word as a user's own `type`.
 */
export interface Entity {
	readonly type: string;
	readonly id: string;
}

/**
 * Everyone who holds `relation` on an entity — `team:t1#member` — which is how
 * a permission is inherited rather than granted.
 *
 * A tuple whose subject is a subject set lets a whole group be given access
 * with one write: granting a record's `viewer` to `team:t1#member` means every
 * member of that team can view it, and no member holds a tuple on the record.
 */
export interface SubjectSet extends Entity {
	readonly relation: string;
}

/**
 * Who a tuple is about: one entity, or everyone who holds a relation on one.
 * {@link isSubjectSet} tells them apart.
 */
export type Subject = Entity | SubjectSet;

/**
 * A relation tuple: `subject` holds `relation` on `object`.
 *
 * `relation` is Zanzibar's word, and a tuple is Zanzibar's unit. What is not
 * carried over is Keto's `namespace`/`object` pair: here the object is an
 * {@link Entity}, with the `type` and `id` a user already has.
 */
export interface RelationTuple {
	readonly object: Entity;
	readonly relation: string;
	readonly subject: Subject;
}

/**
 * Whether this subject is a set rather than one entity. Narrows.
 *
 * It reads the shape, so pass a user through {@link subjectOf} first: a user
 * whose fields include a string `relation` would otherwise read as a set.
 */
export function isSubjectSet(subject: Subject): subject is SubjectSet {
	return typeof (subject as { relation?: unknown }).relation === 'string';
}

/**
 * The subject a user is: their `type` and `id`, and nothing else.
 *
 * One line, and the entire join between the two sides of the package. It
 * takes the narrowest shape it reads, so the permissions side never has to
 * know what a user is, and it copies those two fields so none of the user's
 * own fields ever reaches a tuple.
 */
export function subjectOf(user: {
	readonly type: string;
	readonly id: SubjectId;
}): Entity {
	return { type: user.type, id: user.id };
}

/**
 * The mark `setOf()` puts on a set: a symbol property, so it survives a spread
 * and `Object.assign`, and no value read from a database or from JSON can
 * carry it. Registered with `Symbol.for`, so two copies of this module — two
 * bundles, two entry points — still agree on it.
 */
const SET_OF: unique symbol = Symbol.for('@nxgt/janus/setOf');

/**
 * A subject set `setOf()` made: everyone who holds `relation` on `type:id`.
 *
 * Marked, because a user is passed to `can()` and `grant()` as it is, fields
 * flat on it: a user whose fields include `relation` must stay that user, and
 * never read as the set of whoever holds that relation on them. For an object
 * type, `{ type, id, relation }` is a set as written; for a user type — one
 * the model also declares as an object type — only `setOf()` makes one.
 *
 * A spread keeps the mark. `JSON.stringify` and `structuredClone` drop it:
 * through either, a set comes back as a user — call `setOf()` again, or
 * `parseSubject()` on its notation.
 */
export type SetOf<
	Type extends string = string,
	Relation extends string = string,
> = SubjectSet & {
	readonly type: Type;
	readonly relation: Relation;
	readonly [SET_OF]: true;
};

/**
 * A user or an object, never a set `setOf()` made: where a relation admits
 * `staff` but not `staff#managers`, a set passed there is refused at compile
 * time as it is at run time.
 */
export type NotASet = { readonly [SET_OF]?: never };

/**
 * Everyone who holds `relation` on this user or object — `staff:s1#managers`.
 *
 * ```ts
 * await access.grant(record, 'viewers', setOf(ada, 'managers'));
 * ```
 *
 * Copies `type` and `id` only, like {@link subjectOf}: none of a user's own
 * fields reaches a tuple.
 */
export function setOf<const Type extends string, const Relation extends string>(
	entity: { readonly type: Type; readonly id: SubjectId },
	relation: Relation,
): SetOf<Type, Relation> {
	if (
		typeof entity !== 'object' ||
		entity === null ||
		typeof entity.type !== 'string' ||
		typeof entity.id !== 'string'
	) {
		throw new TypeError('setOf: pass a user or { type, id }, then a relation');
	}
	if (typeof relation !== 'string' || relation === '') {
		throw new TypeError('setOf: the relation must be a non-empty string');
	}
	return Object.freeze({
		type: entity.type,
		id: entity.id,
		relation,
		[SET_OF]: true as const,
	});
}

/**
 * Whether `setOf()` made this value, or a spread of one — what `can()` and
 * `grant()` read to tell a set on a user type from a user.
 */
export function isSetOf(value: unknown): value is SetOf {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { readonly [SET_OF]?: unknown })[SET_OF] === true
	);
}
