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
 * One line, and the entire join between the two halves of the package. It
 * takes the narrowest shape it reads, so the permissions half never has to
 * know what a user is, and it copies those two fields so none of the user's
 * own fields ever reaches a tuple.
 */
export function subjectOf(user: {
	readonly type: string;
	readonly id: SubjectId;
}): Entity {
	return { type: user.type, id: user.id };
}
