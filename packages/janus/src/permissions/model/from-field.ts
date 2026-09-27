/** `fromField`: a relation read from the object's own data, and the lookup that reverses it. */

/**
 * The ids of the objects whose field names this subject id — what `list()`
 * needs to reverse a `fromField`: `(doctorId) => db.records.ids({ doctorId })`.
 * Unpaged; a failure throws, as a store's does.
 */
export type Lookup = (subjectId: string) => Promise<readonly string[]>;

/**
 * A relation read from the object's own data: `fromField('doctorId', 'staff')`
 * holds for the subject of type `staff` whose id is `object.doctorId`.
 *
 * Nothing is stored. `can()` receives the object — the route has already
 * loaded it — and the compiler requires the field on it. `list()` cannot read
 * a field of objects it has not found yet, so it asks `lookup` instead; a
 * `list()` that would need one it was not given is a compile error.
 */
export interface FromField<
	Field extends string = string,
	Subject extends string = string,
> {
	readonly kind: 'fromField';
	readonly field: Field;
	readonly subject: Subject;
	readonly lookup?: Lookup;
}

/** A `fromField` `list()` can reverse. */
export interface ReversibleFromField<
	Field extends string = string,
	Subject extends string = string,
> extends FromField<Field, Subject> {
	readonly lookup: Lookup;
}

export function fromField<
	const Field extends string,
	const Subject extends string,
>(field: Field, subject: Subject): FromField<Field, Subject>;
export function fromField<
	const Field extends string,
	const Subject extends string,
>(
	field: Field,
	subject: Subject,
	options: { readonly lookup: Lookup },
): ReversibleFromField<Field, Subject>;
export function fromField(
	field: string,
	subject: string,
	options?: { readonly lookup: Lookup },
): FromField {
	return Object.freeze(
		options === undefined
			? { kind: 'fromField' as const, field, subject }
			: { kind: 'fromField' as const, field, subject, lookup: options.lookup },
	);
}
