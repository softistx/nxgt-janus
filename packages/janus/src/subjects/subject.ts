/**
 * The string every decision in this package hangs on.
 *
 * It **is** the identity id the identities module mints, so an ownership tuple
 * written from a session and checked from a machine token agree about who the
 * holder is. In Ory that equality — between a Kratos identity id and Keto's
 * `subject_id` — is a comment and a convention, restated in three repositories
 * and enforced nowhere. Here it is a type and a function: see {@link subjectOf}.
 *
 * That shared vocabulary is the whole reason identities and permissions are one
 * package rather than two. Two packages would make this contract implicit, and
 * an implicit contract between two independently versioned packages is one that
 * breaks silently.
 *
 * Opaque: compared with `===`, carried in a URL, logged, never parsed.
 */
export type SubjectId = string;

/**
 * Everyone who holds `relation` on `object` — how a permission is inherited
 * rather than granted.
 *
 * A tuple whose *subject* is a subject set is what lets a whole group be given
 * access with one write: granting `Note:1#viewers` to `Group:eng#members` means
 * every member of that group can view the note, and no member holds a tuple on
 * the note at all.
 */
export interface SubjectSet {
	readonly namespace: string;
	readonly object: string;
	readonly relation: string;
}

/**
 * Who a tuple is about: one person, or everyone who holds a relation.
 *
 * A plain string is a subject id; anything else is a subject set. That is the
 * discriminant, and {@link isSubjectSet} is how to narrow it.
 */
export type Subject = SubjectId | { readonly subjectSet: SubjectSet };

/**
 * A relation tuple: `subject` holds `relation` on `namespace:object`.
 *
 * The field names are Zanzibar's, and Keto's, because they are the terms of the
 * domain and each one is a single word. What is **not** carried over is the
 * casing: Keto writes `subject_set`, and nothing in this package does.
 */
export interface RelationTuple {
	readonly namespace: string;
	readonly object: string;
	readonly relation: string;
	readonly subject: Subject;
}

/** Whether this subject is a set rather than one person. Narrows. */
export function isSubjectSet(
	subject: Subject,
): subject is { readonly subjectSet: SubjectSet } {
	return typeof subject !== 'string';
}

/**
 * The subject an identity is.
 *
 * One line, and the entire join between the two modules. It takes the narrowest
 * shape it reads rather than an `Identity`, so the permissions module never has
 * to know what an identity is — and so a caller can pass anything that carries
 * an id, including a session's `identityId`.
 */
export function subjectOf(identity: { readonly id: SubjectId }): SubjectId {
	return identity.id;
}
